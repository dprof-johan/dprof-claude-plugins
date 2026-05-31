"""Smoke tests for the I/O-free engine. Run with: python -m unittest (from fixture/)."""

import unittest

from rpg.content import build_world
from rpg.engine import Entity, resolve_attack


class EngineTests(unittest.TestCase):
    def test_attack_deals_attack_power(self):
        attacker = Entity("A", hp=10, attack=3)
        defender = Entity("B", hp=10, attack=1)
        dealt = resolve_attack(attacker, defender, roll=lambda: 0.0)  # no crit
        self.assertEqual(dealt, 3)
        self.assertEqual(defender.hp, 7)

    def test_critical_roll_adds_one(self):
        attacker = Entity("A", hp=10, attack=3)
        defender = Entity("B", hp=10, attack=1)
        dealt = resolve_attack(attacker, defender, roll=lambda: 0.9)  # crit
        self.assertEqual(dealt, 4)

    def test_world_has_goblin_and_potion(self):
        _hero, rooms, start = build_world()
        self.assertEqual(start, "entrance")
        self.assertIsNotNone(rooms["hall"].enemy)
        self.assertIsNotNone(rooms["entrance"].item)

    def test_sword_in_hall_buffs_attack(self):
        _hero, rooms, _start = build_world()
        sword = rooms["hall"].item
        self.assertEqual(sword.name, "sword")
        self.assertEqual(sword.attack_bonus, 2)


if __name__ == "__main__":
    unittest.main()
