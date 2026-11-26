# Design

## The story

My aunt raised two daughters and worked as a teacher in a school in Addis Ababa, teaching social studies. She was polite and kind as she taught, and all the children loved her. She loved to hear her students sing, whatever song they chose.

## Audience and intent

Set before any picture was generated:

| | |
|---|---|
| Who watches | My aunt's two daughters and our wider family |
| Where | On a phone, most likely forwarded in a family chat, so the vertical cut is the main one |
| What they should feel at the end | Pride in her, and recognition of the quiet kindness she gave both her daughters and her students |
| How might we | How might we let her daughters see their mother the way her students saw her? |

## Choices that follow from the audience

| Choice | Reason |
|---|---|
| Amharic narration, English subtitles | The family's language first; subtitles for relatives and friends who read English more easily |
| An illustrated, hand-painted look | It reads as a memory, and it does not pretend to be a photograph of a real person |
| One main character, two places (home, school) | Fewer characters and places means fewer consistency problems across ten shots |
| A stock narrator voice | Nobody's real voice is imitated |
| No named song | The detail that matters is that she listened, not which song it was |

## Every shot has a reason

The same text lives in `storyboard.json` as each shot's `reason`, so it travels with the shot.

| Shot | Size | What we see | Why it exists |
|---|---|---|---|
| s01 | Extreme wide | Addis Ababa at dawn, one lit window | Establishes where and when, and that her day starts before the city's |
| s02 | Medium | She braids a daughter's hair at breakfast | Introduces her first as a mother, so the classroom is understood as her second job of care |
| s03 | Wide | The three walk to school together | The hinge between her two roles, in one image |
| s04 | Wide | Children run to meet her at the gate | Shows the students' love instead of only stating it |
| s05 | Medium | At the chalkboard with a map and a globe | Says what she taught, and gives the film its one concrete classroom image |
| s06 | Close-up | She bends beside a small boy's desk | Carries her character: polite and kind even when correcting a child |
| s07 | Wide | A class with every hand raised | The result of that kindness, seen from her side of the room |
| s08 | Medium | She listens, eyes closed, while the children sing | The heart of the film and the detail only the family would know; the longest shot, with the music at its fullest |
| s09 | Medium | Evening at home, marking books beside her daughters | Returns to the home of shot 2 to close the circle |
| s10 | Insert | A piece of chalk in an empty, sunlit classroom | The meaning and the dedication; the chalk from shot 8 returns as the closing motif |

The chalk is the motif: she holds it on the reference sheet, sets it down in shot 8 to listen, and it is the last thing in the film.

## What in the script goes beyond what I was told

The facts I gave were: she raised two daughters, taught social studies in a school in Addis Ababa, was polite and kind, all the children loved her, and she loved to hear her students sing. The narration adds a few ordinary images to carry those facts on screen. They were not checked one by one with the family before release:

| Shot | Added detail | Status |
|---|---|---|
| s02, s09 | Braiding hair at breakfast; marking exercise books in the evening | Added for the picture; not checked |
| s03 | The three of them walking to school together each morning | Added for the picture; not checked |
| s04 | Students waiting for her at the gate | Added for the picture; not checked |
| s08 | "She would put down her chalk and listen" | Added for the picture; not checked |
| All | Her appearance is invented for the illustration and is not a likeness | By design |

## User test 1: the radio cut

**Not run with three listeners before the deadline.** The radio cut was built and is ready to test (`npm run radio`). It is narration over placeholder music on a black screen with English subtitles (`npm run radio`, output in `outputs/radio/`). It tests the story and its timing before any picture is generated.

The plan was to play it to at least three people from the audience, in person or by message. Ask them to say what they think as they listen, then ask:

1. In one sentence, what was this about?
2. Which line stayed with you?
3. Was anything unclear, too fast or too slow?
4. Did anything sound wrong in the Amharic: a word, a name, the pronunciation?

| Listener (relation, not name) | Date | What they said | What they reacted to |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

**What I will change because of it:**

| Feedback | Change to `storyboard.json` | Commit |
|---|---|---|
| | | |

What I would have looked for, and what the build already guards against: timing (the picture is cut to each narration line, so no line is rushed), legibility (subtitles at most two lines of 40 characters, kept above the phone app's buttons), and whether the Amharic pronunciation of place names is right, which only a native listener can judge.

## User test 2: the near-final cut

**Not run before the deadline.** The plan: the same people, or three others from the audience, watch the vertical cut on a phone.

1. What did you feel at the end?
2. Is she recognisably the same woman in every shot?
3. Could you read the subtitles comfortably? Was the music too loud under the voice?
4. Would you forward this to the family? If not, what stops you?

| Viewer (relation, not name) | Date | What they said | What they reacted to |
|---|---|---|---|
| | | | |
| | | | |
| | | | |

**What changed because of it:**

| Feedback | Change | Commit |
|---|---|---|
| | | |
