"""Pure game rules for the tiny RPG: no I/O, RNG injected for testability.

Keeping this module free of `print`/`input` and taking the random source as a
parameter is what makes the combat deterministically testable (see the engine
tests) without the fight loop in `main.py` getting in the way.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, Optional


@dataclass
class Item:
    name: str
    heal: int = 0


@dataclass
class Entity:
    name: str
    hp: int
    attack: int

    @property
    def alive(self) -> bool:
        return self.hp > 0


@dataclass
class Room:
    name: str
    description: str
    exits: Dict[str, str] = field(default_factory=dict)
    enemy: Optional[Entity] = None
    item: Optional[Item] = None


def resolve_attack(attacker: Entity, defender: Entity, roll: Callable[[], float]) -> int:
    """Apply one attack from `attacker` to `defender`.

    `roll` returns a float in [0, 1); a roll >= 0.8 is a "critical" that adds 1
    to the damage. Returns the damage dealt and lowers `defender.hp` (never
    below 0).
    """
    damage = attacker.attack + (1 if roll() >= 0.8 else 0)
    defender.hp = max(0, defender.hp - damage)
    return damage
