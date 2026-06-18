with open("saas-platform/frontend/src/components/GcodeViewerPanel.jsx", "r") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'className="w-10 h-10 rounded-lg cursor-pointer transition-all flex items-center justify-center active:scale-95 focus-within:ring-2 focus-within:ring-lime-500 focus-within:outline-none"' in line:
        pass # It looks like we already added it? Wait, let's check
