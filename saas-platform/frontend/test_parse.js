import { parseGcode } from './src/services/EngineClient.js';
const gcode = `
(--- OP1: POCKETS T6 D31.75 PCD ---)
G0 Z30.0
G1 X10 Y10 Z0 F1000
G1 X20 Y10 Z0 F1000
(--- OP4: CUTOUT T3 D6 ---)
G1 X20 Y20 Z0 F1000
`;
const res = parseGcode(gcode);
console.log(JSON.stringify(res.cutByPass, null, 2));
