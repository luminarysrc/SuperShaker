from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Column, JSON
from pydantic import BaseModel

class Door(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    w: float
    h: float
    qty: int = 1
    type: str = "Shaker"
    grain: str = "None"
    rail_position: Optional[float] = None

class Offcut(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    w: float
    h: float
    qty: int = 1

class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    is_active: bool = False
    # Storing settings as JSON string
    settings: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
