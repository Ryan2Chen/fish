import { should } from "chai";
import "chai/register-should";
import { createServer } from "http";

import { Client } from "lib/client";
import { Server } from "lib/server";

// regression test for a real bug: client.ts's reset() re-derives the local
// player's own handSize from their own (locally known) hand, guarding
// against a broadcast snapshot that doesn't match it -- but the guard used
// to be `if (this.engine.ownSeat && this.engine.ownHand)`. Seat 0 is a
// valid seat, not a boolean, and `0` is falsy in JS, so that guard silently
// no-opped for whichever player sat in seat 0: their handSize[0] came
// straight from the broadcast, unfixed. If that broadcast's handSize[0]
// ever disagreed with their true hand (stale data, a redaction, whatever
// the source), only seat 0 would show the wrong value -- e.g. reading 0
// while they still held cards, which blocks self-choice in the CHOOSE
// phase (handSize[seat] !== 0 gates the "choose" button) while every
// teammate, whose handSize a different code path populates, stays fine.
describe("Client reset() own-seat handSize", () => {
  let clients: Client[] = [],
    server,
    http,
    url;

  before(function (done) {
    this.timeout(8000);
    http = createServer();
    server = new Server(http);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;

      let done_ = false;
      for (const name of ["a", "b", "c", "d", "e", "f"]) {
        const client = new Client(url, "reset-test" as any, name, `${name}-token` as any);
        client.onUpdate = () => {
          if (done_) return;
          if (!clients.every((c) => c.identity !== null)) return;
          done_ = true;
          done();
        };
        clients.push(client);
        client.connect();
      }
    });
  });

  after(() => {
    for (const client of clients) client.socket.disconnect();
    server.socket.close();
    http.close();
  });

  it("seats everyone and starts the game", (done) => {
    let count = 0;
    let started = false;
    clients[0].socket.on("event", (event) => {
      if (event.type === "seatAt") {
        count += 1;
        if (count === 6) clients[0].startGame(false);
      } else if (event.type === "startGameResponse" && !started) {
        started = true;
        done();
      }
    });

    for (let i = 0; i < 6; i++) {
      clients[i].attempt({
        type: "seatAt",
        user: clients[i].identity.id,
        seat: i,
      });
    }
  });

  it("keeps seat 0's own handSize correct across reset(), even when the broadcast disagrees", () => {
    const shooter = clients[0]; // seated at seat 0 -- the falsy-zero case
    const trueSize = shooter.engine.ownHand.size;
    trueSize.should.be.above(0);

    // simulate a "reset" broadcast (as fires on seatAt/swapSeats/reconnect)
    // whose handSize[0] is stale/wrong relative to this player's true hand
    const data = server.rooms["reset-test"].engine.redactFor("a-token" as any);
    data.handSize = { ...data.handSize, 0: 0 };

    shooter.reset(data);

    // pre-fix, the ownSeat-is-falsy-for-seat-0 bug meant this stayed 0 --
    // exactly what made the "choose yourself" button (gated on
    // handSize[seat] !== 0) vanish for the seat-0 player specifically
    shooter.engine.handSize[0].should.equal(trueSize);
  });
});
