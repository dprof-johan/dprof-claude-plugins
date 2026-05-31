"""The hardcoded game world.

Hardcoding (rather than loading rooms from data files) is a deliberate v1
choice for a two-room game — see decisions/0002 in the chronicle.
"""

from .engine import Entity, Item, Room


def build_world():
    """Return (hero, rooms, start_room_name) for a fresh game."""
    hero = Entity(name="Hero", hp=10, attack=3)
    potion = Item(name="potion", heal=5)
    goblin = Entity(name="Goblin", hp=7, attack=2)

    entrance = Room(
        name="entrance",
        description="A damp cave mouth. A potion glints on the floor.",
        exits={"north": "hall"},
        item=potion,
    )
    hall = Room(
        name="hall",
        description="A torch-lit hall. A goblin blocks the way north.",
        exits={"south": "entrance"},
        enemy=goblin,
    )
    rooms = {"entrance": entrance, "hall": hall}
    return hero, rooms, "entrance"
