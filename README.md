# cfish

web app for playing the card game [canadian fish, also known as literature](https://www.pagat.com/quartet/literature.html). hosted on http://cfish.herokuapp.com/.

## wishlist

from 8/14 testing:

- add a stopwatch to track time for the whole game (similar to a chess timer, individual + team clocks); support variations — a fixed budget (e.g. 10 min per team + 3 sec per ask) or fully customizable settings chosen before the game starts
- track time per person
- victory/loss end screen with stats: time per person, cards taken from others, cards taken from themself, MVP, ace tracking, sets they were part of, sets declared correct vs. wrong
- keep the turn-indicator arrow visible until the next turn instead of disappearing, so it's easier to remember whose turn it is
- emoting
- chatbox
- betting: final score, most snipes, most stolen-from
- fix UI bug on declaration (see 8/14 screenshot) — declaration timing isn't landing on the same round; consider more flexibility when declaring (e.g. an undo for a misclick)
- clarify/test what happens when someone stands up mid-game; allow leaving mid-game with someone else taking over
- exportable stats from the game
- soften the disconnect experience: right now the whole game freezes with an "X has disconnected" blocker, which is too disruptive. Keep the cards visible and the game running, and surface disconnects as a chat message instead — closer to how pokernow handles players joining/leaving
