@echo off
chcp 65001 >nul

echo Installing required Python packages (plotly)...
pip install plotly

echo.
echo Starting G-code 3D Viewer...
python gcode_viewer_gui.py

echo.
echo Program finished. Press any key to close this window.
pause >nul
