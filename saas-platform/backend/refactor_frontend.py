import os
import re

path = "../frontend/src/components/SuperShakerPanel.jsx"
with open(path, "r") as f:
    code = f.read()

fraction_utils = """
export function parseDimension(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  str = String(str).trim();
  if (str.includes('-') && str.includes('/')) {
    str = str.replace('-', ' ');
  }
  const parts = str.split(/\\s+/);
  let total = 0;
  for (const part of parts) {
    if (part.includes('/')) {
      const [num, den] = part.split('/');
      if (den && !isNaN(num) && !isNaN(den)) {
        total += parseFloat(num) / parseFloat(den);
      }
    } else {
      if (!isNaN(part)) {
        total += parseFloat(part);
      }
    }
  }
  return total;
}

export function formatDimension(num, useInch) {
  if (num == null || isNaN(num)) return "";
  if (!useInch) return +(num.toFixed(1));
  const inchVal = num / 25.4;
  
  const whole = Math.floor(inchVal);
  const frac = inchVal - whole;
  if (frac < 0.015625) return `${whole}`; // < 1/64
  
  const den = 32;
  const numFrac = Math.round(frac * den);
  if (numFrac === 0) return `${whole}`;
  if (numFrac === den) return `${whole + 1}`;
  
  let n = numFrac;
  let d = den;
  while (n % 2 === 0 && d % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  
  if (whole === 0) return `${n}/${d}`;
  return `${whole}-${n}/${d}`;
}
"""
if "parseDimension" not in code:
    code = code.replace("import React, { useState, useEffect, useRef } from \"react\";", "import React, { useState, useEffect, useRef } from \"react\";\n" + fraction_utils)

old_display = """  const MM_PER_INCH = 25.4;
  const toDisplay = (mm) => useInch ? +(mm / MM_PER_INCH).toFixed(3) : mm;
  const fromDisplay = (val) => useInch ? +(val * MM_PER_INCH).toFixed(2) : val;"""

new_display = """  const MM_PER_INCH = 25.4;
  const toDisplay = (mm) => formatDimension(mm, useInch);
  const fromDisplay = (val) => useInch ? parseDimension(val) * MM_PER_INCH : parseDimension(val);"""

code = code.replace(old_display, new_display)

dimension_input = """
function DimensionInput({ valueMm, onChangeMm, useInch, className, placeholder }) {
  const [str, setStr] = useState("");
  useEffect(() => {
    setStr(String(formatDimension(valueMm, useInch)));
  }, [valueMm, useInch]);

  const handleBlur = () => {
    const parsed = useInch ? parseDimension(str) * 25.4 : parseDimension(str);
    if (!isNaN(parsed) && parsed > 0) {
      onChangeMm(parsed);
      setStr(String(formatDimension(parsed, useInch)));
    } else {
      setStr(String(formatDimension(valueMm, useInch))); // revert
    }
  };

  return (
    <input
      type="text"
      value={str}
      onChange={e => setStr(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => e.key === 'Enter' && handleBlur()}
      className={className}
      placeholder={placeholder}
    />
  );
}
"""
if "function DimensionInput" not in code:
    code = code.replace("export default function SuperShakerPanel", dimension_input + "\nexport default function SuperShakerPanel")


old_new_door_w = """<input type="number" value={toDisplay(newDoor.w)}
                    onChange={e => setNewDoor({ ...newDoor, w: fromDisplay(parseFloat(e.target.value)) })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_new_door_w = """<DimensionInput valueMm={newDoor.w} onChangeMm={val => setNewDoor({ ...newDoor, w: val })} useInch={useInch} className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_new_door_w, new_new_door_w)

old_new_door_h = """<input type="number" value={toDisplay(newDoor.h)}
                    onChange={e => setNewDoor({ ...newDoor, h: fromDisplay(parseFloat(e.target.value)) })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_new_door_h = """<DimensionInput valueMm={newDoor.h} onChangeMm={val => setNewDoor({ ...newDoor, h: val })} useInch={useInch} className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_new_door_h, new_new_door_h)

old_new_door_qty = """<input type="number" value={newDoor.qty}
                    onChange={e => setNewDoor({ ...newDoor, qty: parseInt(e.target.value) || 1 })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_new_door_qty = """<input type="number" value={newDoor.qty}
                    onChange={e => setNewDoor({ ...newDoor, qty: parseInt(e.target.value) || 1 })}
                    className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_new_door_qty, new_new_door_qty)

old_rail_pos = """<input type="number" value={toDisplay(newDoor.rail_position || newDoor.h / 2)}
                    onChange={e => setNewDoor({ ...newDoor, rail_position: fromDisplay(parseFloat(e.target.value)) })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_rail_pos = """<DimensionInput valueMm={newDoor.rail_position || newDoor.h / 2} onChangeMm={val => setNewDoor({ ...newDoor, rail_position: val })} useInch={useInch} className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_rail_pos, new_rail_pos)

old_off_w = """<input type="number" value={toDisplay(newOffcut.w)}
                    onChange={e => setNewOffcut({ ...newOffcut, w: fromDisplay(parseFloat(e.target.value)) })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_off_w = """<DimensionInput valueMm={newOffcut.w} onChangeMm={val => setNewOffcut({ ...newOffcut, w: val })} useInch={useInch} className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_off_w, new_off_w)

old_off_h = """<input type="number" value={toDisplay(newOffcut.h)}
                    onChange={e => setNewOffcut({ ...newOffcut, h: fromDisplay(parseFloat(e.target.value)) })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_off_h = """<DimensionInput valueMm={newOffcut.h} onChangeMm={val => setNewOffcut({ ...newOffcut, h: val })} useInch={useInch} className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_off_h, new_off_h)

old_off_qty = """<input type="number" value={newOffcut.qty}
                    onChange={e => setNewOffcut({ ...newOffcut, qty: parseInt(e.target.value) || 1 })}
                    className="ss-input text-xs py-1 text-center font-mono w-full" />"""
new_off_qty = """<input type="number" value={newOffcut.qty}
                    onChange={e => setNewOffcut({ ...newOffcut, qty: parseInt(e.target.value) || 1 })}
                    className="ss-input text-sm py-1.5 text-center font-mono w-full" />"""
code = code.replace(old_off_qty, new_off_qty)


old_save_cell = """    let val = parseFloat(editingValue);
    if (isNaN(val)) return setEditingCell(null);
    if (editingCell.field === 'w' || editingCell.field === 'h' || editingCell.field === 'rail_position') {
      val = fromDisplay(val);
    }"""
new_save_cell = """    let val = (editingCell.field === 'w' || editingCell.field === 'h' || editingCell.field === 'rail_position')
      ? (useInch ? parseDimension(editingValue) * MM_PER_INCH : parseDimension(editingValue))
      : parseFloat(editingValue);
    if (isNaN(val)) return setEditingCell(null);"""
code = code.replace(old_save_cell, new_save_cell)
code = code.replace("type=\"number\" value={editingValue}", "type=\"text\" value={editingValue}")

# Remove Job Costing Setup explicitly
start_idx = code.find('<div className="flex flex-col gap-2 p-2 rounded-lg" style={{ backgroundColor: "var(--ss-input-bg)", border: "1px solid var(--ss-border)" }}>')
if start_idx != -1:
    cost_text = '<span className="ss-section-title">Job Costing Setup</span>'
    if code[start_idx:start_idx+500].find(cost_text) != -1:
        end_idx = code.find('</div>', code.find('</div>', code.find('</div>', code.find('</div>', start_idx) + 6) + 6) + 6) + 6
        if end_idx != -1:
            code = code[:start_idx] + code[end_idx:]

old_batch_input = """          <input type="file" id="batchUpload" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleBatchUpload} />
          <button onClick={() => document.getElementById('batchUpload').click()} className="ss-btn ss-btn-secondary text-xs">
            Batch Upload
          </button>"""
code = code.replace(old_batch_input, "")

old_add_door = """              <button onClick={handleAddDoor} className="ss-btn ss-btn-primary flex-1 text-xs py-1">
                <span className="mr-1">➕</span> Add Door
              </button>"""
new_add_door = """              <button onClick={handleAddDoor} className="ss-btn ss-btn-primary flex-1 text-sm py-1.5 shadow-md">
                <span className="mr-1">➕</span> Add Door
              </button>
              <input type="file" id="batchUpload" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleBatchUpload} />
              <button onClick={() => document.getElementById('batchUpload').click()} className="ss-btn ss-btn-secondary flex-none text-sm py-1.5 shadow-sm px-3" title="Import Excel/CSV">
                <span className="mr-1">📁</span> Import
              </button>"""
code = code.replace(old_add_door, new_add_door)


with open(path, "w") as f:
    f.write(code)
