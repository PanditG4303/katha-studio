"""Clearly labelled, offline demo material.

Demo records are always flagged is_demo=True. They exist so the complete local
workflow can be exercised without an external AI account. They are never
presented as real research or generated production content.
"""
from __future__ import annotations

DEMO_LABEL = "DEMO — fictional offline sample"

DEMO_IDEAS = [
    {
        "title": "The Lantern Keeper of Nandipur",
        "short_description": (
            "A fictional two-part shadow-puppet tale about a lantern keeper who discovers that the village's "
            "forgotten stories are the only light strong enough to guide travellers home."
        ),
        "hook": "Every night, the old lantern keeper lights a flame for a village that no longer remembers his name.",
        "story_premise": "A mysterious traveller arrives with a broken lantern and a secret about the village's lost stories.",
        "why_interesting": "A self-contained mystery with a warm ending, designed to demonstrate a reusable two-part production workflow.",
        "estimated_duration_seconds": 480,
        "suggested_episode_count": 2,
        "visual_potential": "Layered paper-cut silhouettes, warm amber light, slow shadow reveals and a rotating puppet stage.",
        "source_status": "Demo only — fictional, no factual claims",
    },
    {
        "title": "The Cartographer of Small Things",
        "short_description": (
            "A fictional short about a mapmaker who charts ordinary moments instead of roads. "
            "Created only to demonstrate an independent single-episode project."
        ),
        "hook": "She has mapped every road in the kingdom, except the one that leads to a quiet afternoon.",
        "story_premise": "A royal cartographer learns to notice the tiny places where life actually happens.",
        "why_interesting": "A gentle visual story with clear scene transitions and a simple voice-casting demonstration.",
        "estimated_duration_seconds": 240,
        "suggested_episode_count": 1,
        "visual_potential": "Ink lines blooming into landscapes, paper textures, miniature sets.",
        "source_status": "Demo only — fictional, no factual claims",
    },
]

DEMO_BLUEPRINT = {
    "title": "The Lantern Keeper of Nandipur",
    "logline": "A stranger's broken lantern leads an old keeper to relight the stories his village abandoned.",
    "research_summary": (
        "This is an original fictional demonstration story. It makes no historical, religious or scientific claims. "
        "Its visual language is inspired by South Asian shadow-puppet theatre in general, without copying any specific "
        "traditional narrative, character, artwork or performance."
    ),
    "sources": [
        {
            "title": "Katha Studio offline demo material",
            "url": "",
            "note": "Original fictional demonstration written for this application. Not a research source.",
            "type": "demo",
        }
    ],
    "source_status": "DEMO — fictional sample. Not researched.",
    "opening_hook": "They say a village dies twice. First its stories are forgotten, then its lamps go out.",
    "outro": "Some lights are not kept by oil, but by the voices willing to remember.",
    "cta": "If this story stayed with you, subscribe for the next tale from the lantern road.",
    "characters": [
        {
            "name": "Narrator",
            "role": "Narrator",
            "description": "Warm, measured storyteller.",
            "appearance": "Unseen. Represented by the lamp flame and moving shadow.",
            "personality": "Reflective and intimate.",
            "continuity_notes": "Maintain measured pace and warm delivery.",
            "speaker_type": "narrator",
        },
        {
            "name": "Meera",
            "role": "Protagonist — the lantern keeper",
            "description": "An elderly woman who keeps the last public lantern in Nandipur.",
            "appearance": "Deep teal sari, silver hair in a low knot, brass key ring at her waist, hunched but steady.",
            "personality": "Practical, dry-witted, quietly stubborn.",
            "continuity_notes": "Carries a brass lamp with a crescent-shaped handle. Her left sleeve is patched.",
            "speaker_type": "female",
        },
        {
            "name": "Arav",
            "role": "The traveller",
            "description": "A young traveller carrying a lantern with no flame.",
            "appearance": "Dusty saffron shawl, worn boots, a cracked glass lantern, ink-stained fingers.",
            "personality": "Curious, impatient, secretly grieving.",
            "continuity_notes": "Always holds the broken lantern close to his chest until the final scene.",
            "speaker_type": "male",
        },
    ],
    "episodes": [
        {
            "episode_number": 1,
            "title": "The Unlit Road",
            "summary": "Arav arrives after dusk. Meera lets him in but refuses to light his lantern until he tells her why the village's stories went dark.",
            "estimated_duration_seconds": 300,
        },
        {
            "episode_number": 2,
            "title": "The Flame That Listens",
            "summary": "Meera shows Arav that the lantern burns brightest when a forgotten story is spoken aloud, and the two relight the village together.",
            "estimated_duration_seconds": 300,
        },
    ],
}

DEMO_EPISODES = {
    1: {
        "title": "The Unlit Road",
        "summary": "Arav arrives after dusk and asks Meera to light a lantern that has refused every flame.",
        "opening_hook": "They say a village dies twice. First its stories are forgotten, then its lamps go out.",
        "narration_script": (
            "They say a village dies twice. First its stories are forgotten, then its lamps go out. "
            "In Nandipur, the second death had already begun. Only one lamp still burned, and its keeper was Meera."
        ),
        "screenplay": (
            "EXT. NANDIPUR ROAD — DUSK\n\nA broken lantern swings in Arav's hand. The village is a row of dark windows.\n\n"
            "MEERA\nYou are late, traveller.\n\nARAV\nI am. My lantern is also late to burn."
        ),
        "outro": "The flame waited. And somewhere in the dark, a story took its first breath.",
        "teaser": "Next: what does a lantern remember when no one is listening?",
        "cta": "",
        "scenes": [
            {
                "scene_number": 1,
                "heading": "EXT. NANDIPUR ROAD — DUSK",
                "start_time": 0,
                "end_time": 48,
                "action": "Arav walks toward a single amber light. Dark paper-cut houses lean into the road.",
                "visual_composition": "Wide silhouette, tiny traveller against a large amber lantern.",
                "background": "Layered cut-paper hills and rooftops in indigo and charcoal.",
                "lighting": "Single warm pool around Meera's lantern; cool blue dusk.",
                "camera_movement": "Slow push in along the road.",
                "expressions": "Arav: guarded. Meera: watchful.",
                "animation_instructions": "Animate layered paper parallax, gently swaying lantern and drifting dust motes.",
                "sound_effects": "Dry leaves, distant night birds, creaking lantern handle.",
                "music_cue": "Low tanpura drone and a sparse single-note motif.",
                "transition": "Dissolve through the lantern flame.",
                "continuity": "Arav carries the cracked lantern in his right hand.",
                "narration": "They say a village dies twice. First its stories are forgotten, then its lamps go out.",
                "dialogue": [
                    {
                        "speaker": "Narrator",
                        "speaker_type": "narrator",
                        "text": "They say a village dies twice. First its stories are forgotten, then its lamps go out.",
                        "emotion": "Reflective",
                        "delivery": "Slow, intimate, leave a small pause after 'twice'.",
                        "start_time": 2,
                        "end_time": 12,
                    },
                    {
                        "speaker": "Narrator",
                        "speaker_type": "narrator",
                        "text": "In Nandipur, the second death had already begun. Only one lamp still burned, and its keeper was Meera.",
                        "emotion": "Quietly ominous",
                        "delivery": "Steady, dropping slightly on the final name.",
                        "start_time": 14,
                        "end_time": 27,
                    },
                ],
            },
            {
                "scene_number": 2,
                "heading": "EXT. THE LAST LANTERN — CONTINUOUS",
                "start_time": 48,
                "end_time": 132,
                "action": "Meera lifts her lamp. Arav steps close, but hides his broken lantern behind his shawl.",
                "visual_composition": "Two-shot profile, Meera's lamp between them.",
                "background": "A wooden doorway with hanging brass bells.",
                "lighting": "Warm lantern key light, deep indigo fill.",
                "camera_movement": "Static, then a subtle lateral drift.",
                "expressions": "Meera narrows her eyes; Arav avoids her gaze.",
                "animation_instructions": "Puppet-style joint movement. Keep silhouettes crisp; use warm rim light on faces.",
                "sound_effects": "A single brass bell, cloth rustle.",
                "music_cue": "Motif becomes a soft question.",
                "transition": "Match cut on the lantern glass.",
                "continuity": "Meera's left sleeve patch is visible.",
                "narration": "",
                "dialogue": [
                    {
                        "speaker": "Meera",
                        "speaker_type": "female",
                        "text": "You are late, traveller.",
                        "emotion": "Dry, unimpressed",
                        "delivery": "Short and grounded.",
                        "start_time": 52,
                        "end_time": 56,
                    },
                    {
                        "speaker": "Arav",
                        "speaker_type": "male",
                        "text": "I am. My lantern is also late to burn.",
                        "emotion": "Guarded",
                        "delivery": "An attempt at lightness that does not quite land.",
                        "start_time": 59,
                        "end_time": 65,
                    },
                    {
                        "speaker": "Meera",
                        "speaker_type": "female",
                        "text": "A lantern does not burn for a stranger who tells half a story.",
                        "emotion": "Knowing",
                        "delivery": "Quiet, deliberate.",
                        "start_time": 68,
                        "end_time": 74,
                    },
                ],
            },
            {
                "scene_number": 3,
                "heading": "INT. LANTERN ROOM — NIGHT",
                "start_time": 132,
                "end_time": 240,
                "action": "Arav sets the broken lantern on the table. Its cracked glass catches the room's single flame.",
                "visual_composition": "Overhead table composition, hands and lantern in warm light.",
                "background": "Walls covered in small paper notes, each with a name.",
                "lighting": "Intimate candlelight; shadows of hanging paper move slowly.",
                "camera_movement": "Top-down, then rise to frame both faces.",
                "expressions": "Arav finally looks up; Meera waits.",
                "animation_instructions": "Use the existing hanging-paper asset; animate shadows at half speed.",
                "sound_effects": "Glass tick, paper flutter.",
                "music_cue": "Drone fades to near silence before the outro.",
                "transition": "Fade to warm black.",
                "continuity": "The lantern is still unlit at the end of part one.",
                "narration": "",
                "dialogue": [
                    {
                        "speaker": "Arav",
                        "speaker_type": "male",
                        "text": "My mother used to say this lantern remembered every story told beneath it. I need one more story, Meera.",
                        "emotion": "Vulnerable",
                        "delivery": "Slower on 'one more story'.",
                        "start_time": 140,
                        "end_time": 154,
                    },
                    {
                        "speaker": "Meera",
                        "speaker_type": "female",
                        "text": "Then tell me the one you have been carrying. The one you have not said aloud.",
                        "emotion": "Gentle challenge",
                        "delivery": "Soft, almost a whisper.",
                        "start_time": 158,
                        "end_time": 168,
                    },
                    {
                        "speaker": "Narrator",
                        "speaker_type": "narrator",
                        "text": "The flame waited. And somewhere in the dark, a story took its first breath.",
                        "emotion": "Hushed wonder",
                        "delivery": "Slow, leaving room after 'waited'.",
                        "start_time": 214,
                        "end_time": 230,
                    },
                ],
            },
        ],
    },
    2: {
        "title": "The Flame That Listens",
        "summary": "Arav tells the truth. Meera relights the village's stories one lantern at a time.",
        "opening_hook": "Some flames do not need oil. They need a voice willing to remember.",
        "narration_script": "Some flames do not need oil. They need a voice willing to remember.",
        "screenplay": (
            "INT. LANTERN ROOM — NIGHT\n\nArav speaks his mother's name. The lantern glass brightens from within.\n\n"
            "MEERA\nThere. The story has found its wick."
        ),
        "outro": "Some lights are not kept by oil, but by the voices willing to remember.",
        "teaser": "",
        "cta": "If this story stayed with you, subscribe for the next tale from the lantern road.",
        "scenes": [
            {
                "scene_number": 1,
                "heading": "INT. LANTERN ROOM — NIGHT",
                "start_time": 0,
                "end_time": 90,
                "action": "Arav speaks. The flame bends toward him, listening.",
                "visual_composition": "Close on the broken lantern, Arav's face reflected in the glass.",
                "background": "Paper notes glow softly in the dark.",
                "lighting": "One amber flame, rich shadow.",
                "camera_movement": "Slow push toward the glass.",
                "expressions": "Arav: grief giving way to relief.",
                "animation_instructions": "Use flicker and paper-layer reveal; no new character designs needed.",
                "sound_effects": "Soft breath, glass chime.",
                "music_cue": "Warm strings enter beneath the drone.",
                "transition": "Light bloom.",
                "continuity": "Same cracked lantern and patched sleeve.",
                "narration": "",
                "dialogue": [
                    {
                        "speaker": "Narrator",
                        "speaker_type": "narrator",
                        "text": "Some flames do not need oil. They need a voice willing to remember.",
                        "emotion": "Warm",
                        "delivery": "Measured, with a smile in the voice.",
                        "start_time": 2,
                        "end_time": 10,
                    },
                    {
                        "speaker": "Arav",
                        "speaker_type": "male",
                        "text": "Her name was Leela. She told me every story except the one where she had to leave.",
                        "emotion": "Grief, relief",
                        "delivery": "Break gently after her name.",
                        "start_time": 14,
                        "end_time": 24,
                    },
                ],
            },
            {
                "scene_number": 2,
                "heading": "EXT. NANDIPUR LANTERN ROAD — DAWN",
                "start_time": 90,
                "end_time": 180,
                "action": "Arav and Meera light one lantern after another. Windows open. Silhouettes gather.",
                "visual_composition": "Symmetrical road, lanterns igniting in a chain.",
                "background": "Village rooftops and a pale peach dawn.",
                "lighting": "Cool dawn warming into gold.",
                "camera_movement": "Lateral tracking shot, then crane up.",
                "expressions": "Villagers curious, then smiling.",
                "animation_instructions": "Reuse the layered village background; animate lantern glows sequentially.",
                "sound_effects": "Shutters, footsteps, soft chatter.",
                "music_cue": "Main theme resolves with light percussion.",
                "transition": "Crane up into the final title.",
                "continuity": "The first lit lamp is Meera's crescent-handled brass lamp.",
                "narration": "",
                "dialogue": [
                    {
                        "speaker": "Meera",
                        "speaker_type": "female",
                        "text": "There. The story has found its wick.",
                        "emotion": "Satisfied",
                        "delivery": "Warm, matter-of-fact.",
                        "start_time": 96,
                        "end_time": 101,
                    },
                    {
                        "speaker": "Arav",
                        "speaker_type": "male",
                        "text": "Then let us give the village enough light to remember.",
                        "emotion": "Hopeful",
                        "delivery": "Bright, clear.",
                        "start_time": 106,
                        "end_time": 112,
                    },
                    {
                        "speaker": "Narrator",
                        "speaker_type": "narrator",
                        "text": "Some lights are not kept by oil, but by the voices willing to remember.",
                        "emotion": "Warm resolve",
                        "delivery": "Gentle, final.",
                        "start_time": 154,
                        "end_time": 163,
                    },
                ],
            },
        ],
    },
}
