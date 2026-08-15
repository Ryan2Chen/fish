# cfish

web app for playing the card game [canadian fish, also known as literature](https://www.pagat.com/quartet/literature.html). hosted on andoverfish.com

## wishlist

- top person emote cutoff. prob just add some top padding <img width="530" height="180" alt="Screenshot 2026-08-14 at 11 46 43 PM" src="https://github.com/user-attachments/assets/74718b94-1e07-4719-b715-39281a553fed" />
- add a question mark icon next to arrow when actively asking
- add a kick feature
- pause needs to detect when we reconnect
- make it so the card count waits for animation to finish
- let people declare whenever, not just their personal turn
- autoscrolling chat (to newest message)
- expand emotes to include 😭😔💀
- rush someone emote. like ! / angry face next to the person who we're waiting for. maybe picture of Mr. Perry
- make answer to being asked immediate rather than waiting for user input
- make the sort button and emote button be next to each other rather than vertically stacked <img width="346" height="106" alt="Screenshot 2026-08-14 at 11 37 37 PM" src="https://github.com/user-attachments/assets/f7a377aa-1176-4d28-a8ac-7b3e91442c86" />
- reduce this vertical spacing <img width="212" height="397" alt="Screenshot 2026-08-14 at 11 38 45 PM" src="https://github.com/user-attachments/assets/f7f17694-487e-4d49-b8ce-504353c9d9b9" />
- why are the icons different sizes ? fix UI cuz why is '100 chips' wrapping around
- have messages pop up
- similar to how emotes currently work, have the different avatar options only show up when you click on your own avatar.
- Add bottom padding for chat box so that it isn't touching the bottom of the screen
- fix this UI option configuration: <img width="523" height="169" alt="image" src="https://github.com/user-attachments/assets/ac9d7a63-32cb-4515-bc69-b07d7c30d1ea" />
- add white background to users' boxes rather than having it be transparent: <img width="217" height="98" alt="image" src="https://github.com/user-attachments/assets/a3eec0ec-0baa-4fcd-90f1-e2c21abc7d85" />
- replace "emote" button with the options that get revealed upon clicking it
- Fix it crashing when someone disconnects / other people crashing and being unable to reload


-----------

From 8/14 testing:
- add stop watch / track time for the whole game
- add track time for each person
- victory/lose end screen with stats: time per person, # card taken from others, # cards taken from themself, MVP, Ace, track sets they were part of, # sets declared correct, # sets declared wrong
- ui: maintain arrow so it stays until the next turn, easier to remember
- Betting on final score, person who gets most snipes, person who gets stolen from the most
- Fix UI Bug on declaration
<img width="1471" height="801" alt="Screenshot 2026-08-14 at 12 36 20 PM" src="https://github.com/user-attachments/assets/934dea25-f0d0-41ed-a86c-97569569cf07" />
- Clarify / test what happens when u stand up mid game / allow people to leave mid game and have someone else take over
- exportable stats from the game

- make action more legible
- think about overall layout again
  - score in info panel should be moved
- color things not gray
- allow declares to be canceled?
- show cards to spectators?
- handle errors other than logging to console
- rotate seats so self is always at bottom?
- make logitem nicer
- use actual card pictures?
- add audio cues and volume control
- add settings for number of suits
- add settings for number of players
- predict actions client-side
