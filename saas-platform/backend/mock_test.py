import sys
from unittest.mock import MagicMock

sys.modules['pandas'] = MagicMock()
sys.modules['fastapi'] = MagicMock()
sys.modules['fastapi.middleware.cors'] = MagicMock()
sys.modules['fastapi.staticfiles'] = MagicMock()
sys.modules['fastapi.responses'] = MagicMock()
sys.modules['fastapi.concurrency'] = MagicMock()
sys.modules['fastapi.security'] = MagicMock()
sys.modules['pydantic'] = MagicMock()
sys.modules['slowapi'] = MagicMock()
sys.modules['slowapi.util'] = MagicMock()
sys.modules['slowapi.errors'] = MagicMock()
sys.modules['sqlmodel'] = MagicMock()

import main
print("main imported successfully")
