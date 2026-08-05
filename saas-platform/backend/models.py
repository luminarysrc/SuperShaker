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
    # IKEA Kitchen Planner integration
    cabinet_id: Optional[str] = Field(default=None, index=True)  # e.g. "B01", for Grain Match grouping
    articul: Optional[str] = None                                  # IKEA article number, e.g. "902.553.87"
    cabinet_position: Optional[str] = None                         # "left", "right", "top", etc.
    # Drilling control
    skip_drilling: bool = False                                     # True for false panels, decorative strips


class Offcut(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    w: float
    h: float
    qty: int = 1

class Job(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    type: str = "nesting"
    status: str = "PENDING"
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    error: Optional[str] = None

class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str
    is_active: bool = False
    settings: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))


class MaterialPreset(SQLModel, table=True):
    """Material library: quick-select presets for sheet goods."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    name: str = Field(index=True)                   # e.g. "MDF 18mm White Primer"
    sheet_length: float = 2440.0                    # Sheet length, mm (H)
    sheet_width: float = 1220.0                     # Sheet width, mm (W)
    thickness: float = 18.0                         # Material thickness, mm
    grain: str = "None"                             # "None" | "Horizontal" | "Vertical"
    edge_thickness: float = 0.4                     # Edge banding thickness, mm
    fuging_allowance: float = 0.0                   # Extra mm added back after fuging
    is_default: bool = False                        # Starred / default preset

