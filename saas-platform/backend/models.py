from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Column, JSON
from pydantic import BaseModel

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    is_active: bool = True
    is_admin: bool = False

class Door(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    w: float
    h: float
    qty: int = 1
    type: str = "Shaker"
    grain: str = "None"
    rail_position: Optional[float] = None

class Offcut(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    w: float
    h: float
    qty: int = 1

class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    is_active: bool = False
    # Storing settings as JSON string
    settings: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
