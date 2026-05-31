"""Command parser + fight loop. The only module that does I/O.

I/O is injected (`input_fn`, `output_fn`, `roll`) so a scripted playthrough can
drive the whole game in a test without a real terminal.
"""

import random

from .content import build_world
from .engine import resolve_attack

HELP = "commands: look, go <dir>, take, use <item>, attack, quit"


def run(input_fn=input, output_fn=print, roll=random.random):
    hero, rooms, here = build_world()
    inventory = []
    output_fn("Tiny RPG. Defeat the goblin. " + HELP)

    while True:
        if not hero.alive:
            output_fn("You died. GAME OVER")
            return

        try:
            raw = input_fn("> ").strip().lower()
        except EOFError:
            return
        if not raw:
            continue

        cmd, _, arg = raw.partition(" ")
        room = rooms[here]

        if cmd == "quit":
            return
        elif cmd == "look":
            output_fn(room.description)
        elif cmd == "go":
            dest = room.exits.get(arg)
            if dest:
                here = dest
                output_fn(rooms[here].description)
            else:
                output_fn("You can't go that way.")
        elif cmd == "take":
            if room.item:
                inventory.append(room.item)
                output_fn(f"You take the {room.item.name}.")
                room.item = None
            else:
                output_fn("Nothing to take.")
        elif cmd == "use":
            item = next((i for i in inventory if i.name == arg), None)
            if item:
                hero.hp += item.heal
                inventory.remove(item)
                output_fn(f"You use the {item.name}. HP is now {hero.hp}.")
            else:
                output_fn(f"You don't have a {arg}.")
        elif cmd == "attack":
            enemy = room.enemy
            if not enemy or not enemy.alive:
                output_fn("Nothing to fight here.")
                continue
            dealt = resolve_attack(hero, enemy, roll)
            output_fn(f"You hit the {enemy.name} for {dealt}. ({enemy.name} HP: {enemy.hp})")
            if not enemy.alive:
                output_fn("YOU WIN")
                return
            back = resolve_attack(enemy, hero, roll)
            output_fn(f"The {enemy.name} hits back for {back}. (your HP: {hero.hp})")
        else:
            output_fn(HELP)
