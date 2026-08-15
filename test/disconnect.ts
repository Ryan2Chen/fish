import { should } from "chai";
import "chai/register-should";
import { createServer } from "http";

import { Client } from "lib/client";
import { Server } from "lib/server";

describe("Disconnect / reconnect", () => {
  const DISCONNECT_MS = 150;
  let clients: Client[] = [],
    server,
    http,
    url;

  // wait for a single broadcast of the given type, then unsubscribe
  const onceEventType = (client: Client, type: string, cb: (event: any) => void) => {
    const handler = (event) => {
      if (event.type !== type) return;
      client.socket.off("event", handler);
      cb(event);
    };
    client.socket.on("event", handler);
  };

  before((done) => {
    http = createServer();
    server = new Server(http, DISCONNECT_MS);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;
      clients.push(new Client(url, "disc" as any, "a", "a-token" as any));
      clients[0].connect();
      clients[0].socket.on("connect", () => done());
    });
  });

  after(() => {
    for (const client of clients) client.socket.disconnect();
    server.socket.close();
    http.close();
  });

  it("connects and seats everyone", (done) => {
    let seated = 0;
    let started = false;

    clients[0].socket.on("event", (event) => {
      if (event.type !== "seatAt") return;
      seated += 1;
      if (seated === 6) done();
    });

    // wait until every client has heard its own identity echoed back
    // before seating anyone, rather than racing on a single client's view
    const maybeSeatAll = () => {
      if (started) return;
      if (!clients.every((c) => c.identity !== null)) return;
      started = true;
      for (let i = 0; i < 6; i++) {
        clients[i].attempt({
          type: "seatAt",
          user: clients[i].identity.id,
          seat: i,
        });
      }
    };

    clients[0].onUpdate = maybeSeatAll;
    ["b", "c", "d", "e", "f"].forEach((name, i) => {
      const client = new Client(url, "disc" as any, name, `${name}-token` as any);
      client.onUpdate = maybeSeatAll;
      clients.push(client);
      client.connect();
    });
  });

  it("pauses the game when a seated player disconnects", (done) => {
    onceEventType(clients[0], "pause", (event) => {
      event.user.should.equal("b-token");
      clients[0].engine.paused.should.equal(true);
      clients[0].engine.pausedUsers.should.deep.equal(["b-token"]);
      done();
    });
    clients[1].socket.disconnect();
  });

  it("blocks game actions while paused", (done) => {
    clients[0].socket.once("error", (msg) => {
      msg.should.equal("game is paused");
      done();
    });
    clients[0].attempt({ type: "unseatAt", seat: 0 });
  });

  it("resumes and restores identity when the same token reconnects", (done) => {
    onceEventType(clients[0], "unpause", () => {
      clients[0].engine.paused.should.equal(false);
      clients[0].engine.userOf[1].should.equal("b-token");
      done();
    });

    clients[1] = new Client(url, "disc" as any, "b", "b-token" as any);
    clients[1].connect();
  });

  it("falls back to removing a player who never reconnects", (done) => {
    onceEventType(clients[0], "removeUser", (event) => {
      event.user.should.equal("c-token");
      (clients[0].engine.userOf[2] === null).should.equal(true);
      done();
    });
    clients[2].socket.disconnect();
  });
});

// the wishlist asked to "clarify/test" what happens if someone stands up or
// disconnects mid-game and whether someone else can take over -- seatAt and
// unseatAt have no phase restriction, and a vacated seat's hand stays put
// (it belongs to the seat, not the user), so this should already just work;
// this locks that behavior in with a real mid-hand scenario
describe("Mid-game seat takeover", () => {
  const DISCONNECT_MS = 150;
  let clients: Client[] = [],
    server,
    http,
    url;

  const onceEventType = (client: Client, type: string, cb: (event: any) => void) => {
    const handler = (event) => {
      if (event.type !== type) return;
      client.socket.off("event", handler);
      cb(event);
    };
    client.socket.on("event", handler);
  };

  before(function (done) {
    // 6 clients connecting/seating/starting is several real socket
    // round-trips -- can occasionally exceed mocha's default 2000ms hook
    // timeout under load from the rest of the suite
    this.timeout(8000);

    http = createServer();
    server = new Server(http, DISCONNECT_MS);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;

      let started = false;
      const maybeSeatAll = () => {
        if (started) return;
        if (!clients.every((c) => c.identity !== null)) return;
        started = true;
        for (let i = 0; i < 6; i++) {
          clients[i].attempt({ type: "seatAt", user: clients[i].identity.id, seat: i });
        }
      };

      let gameStarted = false;
      ["a", "b", "c", "d", "e", "f"].forEach((name, i) => {
        const client = new Client(url, "midgame" as any, name, `${name}-token` as any);
        client.onUpdate = () => {
          maybeSeatAll();
          if (gameStarted) return;
          const seatsFilled = clients[0].engine?.seats.filter((s) => clients[0].engine.userOf[s] !== null).length ?? 0;
          if (seatsFilled !== 6) return;

          // whoever the server actually made host isn't guaranteed to be
          // clients[0] ("a") -- connection order across separate sockets
          // isn't guaranteed to match the order we called .connect() in,
          // so figure out who really holds it and start the game as them
          const hostToken = clients[0].engine.host;
          const host = clients.find((c) => c.identity?.id === hostToken);
          if (host === undefined) return;

          gameStarted = true;
          host.attempt({ type: "startGame", user: hostToken, shuffle: true });
        };
        clients.push(client);
        client.connect();
      });

      onceEventType(clients[0], "startGameResponse", () => done());
    });
  });

  after(() => {
    for (const client of clients) client.socket.disconnect();
    server.socket.close();
    http.close();
  });

  it("frees a disconnected player's seat mid-hand without touching their hand", (done) => {
    clients[0].engine.phase.should.equal(1); // ASK
    const handBefore = server.rooms["midgame"].engine.handOf[1].size;

    onceEventType(clients[0], "removeUser", (event) => {
      event.user.should.equal("b-token");
      (clients[0].engine.userOf[1] === null).should.equal(true);
      // the seat's cards are untouched -- only the occupant changed
      server.rooms["midgame"].engine.handOf[1].size.should.equal(handBefore);
      done();
    });
    clients[1].socket.disconnect();
  });

  it("lets a new player claim the vacated seat and inherit its hand", (done) => {
    let claimed = false;
    const takeover = new Client(url, "midgame" as any, "g", "g-token" as any);
    takeover.onUpdate = () => {
      if (!claimed && takeover.identity !== null && takeover.engine?.ownSeat === null) {
        claimed = true;
        takeover.attempt({ type: "seatAt", user: takeover.identity.id, seat: 1 });
      }
      if (takeover.engine?.ownSeat === 1 && takeover.engine.ownHand !== null) {
        takeover.engine.ownHand.size.should.be.above(0);
        takeover.engine.phase.should.equal(1); // still mid-hand, not reset to WAIT
        takeover.socket.disconnect();
        done();
      }
    };
    takeover.connect();
  });
});

// regression test for a real bug: pausedUser used to be a single field, so
// a second disconnect overwrote tracking of the first, and that second
// user's reconnect alone would wrongly clear "paused" while the first
// user was still gone. The game would then look fully resumed until the
// first user's own timeout silently removed their seat later, mid-hand --
// this is what a live game "randomly resetting" on disconnect looked like.
describe("Concurrent disconnects", () => {
  const DISCONNECT_MS = 5000; // long enough that neither timer fires mid-test
  let clients: Client[] = [],
    server,
    http,
    url;

  const onceEventType = (client: Client, type: string, cb: (event: any) => void) => {
    const handler = (event) => {
      if (event.type !== type) return;
      client.socket.off("event", handler);
      cb(event);
    };
    client.socket.on("event", handler);
  };

  before(function (done) {
    this.timeout(8000); // see the same-shaped hook above for why
    http = createServer();
    server = new Server(http, DISCONNECT_MS);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;

      let started = false;
      const maybeSeatAll = () => {
        if (started) return;
        if (!clients.every((c) => c.identity !== null)) return;
        started = true;
        for (let i = 0; i < 6; i++) {
          clients[i].attempt({ type: "seatAt", user: clients[i].identity.id, seat: i });
        }
      };

      let seated = 0;
      ["a", "b", "c", "d", "e", "f"].forEach((name, i) => {
        const client = new Client(url, "concurrent" as any, name, `${name}-token` as any);
        client.onUpdate = () => {
          maybeSeatAll();
          if (client === clients[0] && seated < 6) {
            const s = clients[0].engine?.seats.filter((s) => clients[0].engine.userOf[s] !== null).length ?? 0;
            if (s === 6) {
              seated = 6;
              done();
            }
          }
        };
        clients.push(client);
        client.connect();
      });
    });
  });

  after(() => {
    for (const client of clients) client.socket.disconnect();
    server.socket.close();
    http.close();
  });

  it("stays paused if a second disconnected player reconnects while the first is still out", (done) => {
    onceEventType(clients[0], "pause", (event) => {
      event.user.should.equal("b-token");
      clients[0].engine.paused.should.equal(true);

      // b (seat 1) is now disconnected; c (seat 2) disconnects too, then
      // reconnects, while b is still gone
      onceEventType(clients[0], "pause", (event2) => {
        event2.user.should.equal("c-token");
        clients[0].engine.pausedUsers.should.have.members(["b-token", "c-token"]);

        onceEventType(clients[0], "unpause", (event3) => {
          event3.user.should.equal("c-token");

          // the bug: this used to become false here, even though b never reconnected
          clients[0].engine.paused.should.equal(true);
          clients[0].engine.pausedUsers.should.deep.equal(["b-token"]);
          done();
        });

        clients[2] = new Client(url, "concurrent" as any, "c", "c-token" as any);
        clients[2].connect();
      });

      clients[2].socket.disconnect();
    });

    clients[1].socket.disconnect();
  });
});

// regression test for the "created a new game but it still said I was
// disconnected" report: navigating to a new room (or a duplicate tab)
// without a full page reload leaves the OLD socket connected in the
// background under the same persistent token. If that stale connection's
// eventual disconnect got attributed to whatever room the token is in BY
// THEN, it would wrongly pause/haunt the brand-new room instead of the
// one it actually left.
describe("Stale connection across rooms", () => {
  let server, http, url;

  before((done) => {
    http = createServer();
    server = new Server(http, 60_000);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;
      done();
    });
  });

  after(() => {
    server.socket.close();
    http.close();
  });

  const onceEventType = (client: Client, type: string, cb: (event: any) => void) => {
    const handler = (event) => {
      if (event.type !== type) return;
      client.socket.off("event", handler);
      cb(event);
    };
    client.socket.on("event", handler);
  };

  it("attributes the stale connection's disconnect to its old room, not the new one", function (done) {
    this.timeout(8000);

    // NOTE: `new Client(...)` starts the underlying socket.io connection
    // immediately (autoConnect), but its "connect" event listener isn't
    // attached until `.connect()` is called. Always pair construction and
    // .connect() back to back for each client -- deferring .connect() (as
    // an earlier version of this test did for `spectator`, inside a later
    // async callback) risks missing a "connect" that already fired,
    // leaving that client stuck at status "waiting" forever even though
    // its socket is actually connected.
    const staleClient = new Client(url, "roomA" as any, "ryan", "shared-token" as any);
    staleClient.connect();
    const spectator = new Client(url, "roomA" as any, "spectator", "spectator-token" as any);
    spectator.connect();

    staleClient.socket.on("connect", () => {
      staleClient.attempt({ type: "seatAt", user: "shared-token" as any, seat: 0 });
    });

    spectator.onUpdate = () => {
      // wait until the spectator has actually seen the seat land, so the
      // new connection below isn't racing the seatAt round-trip
      if (spectator.engine?.userOf[0] !== ("shared-token" as any)) return;
      spectator.onUpdate = null;

      // join roomB with the SAME token WITHOUT ever disconnecting
      // staleClient -- exactly what a client-side-only route change (no
      // unmount cleanup) would do
      const newClient = new Client(url, "roomB" as any, "ryan", "shared-token" as any);
      newClient.connect();

      let roomAPaused = false;
      let roomBReady = false;
      let finished = false;
      const maybeFinish = () => {
        if (finished || !roomAPaused || !roomBReady) return;
        finished = true;
        newClient.onUpdate = null;

        spectator.engine.paused.should.equal(true); // roomA correctly notices the departure
        spectator.engine.pausedUsers.should.deep.equal(["shared-token"]);
        newClient.engine.paused.should.equal(false); // roomB stays clean

        newClient.socket.disconnect();
        spectator.socket.disconnect();
        done();
      };

      onceEventType(spectator, "pause", (event) => {
        event.user.should.equal("shared-token");
        roomAPaused = true;
        maybeFinish();
      });

      newClient.onUpdate = () => {
        if (newClient.engine === null) return;
        roomBReady = true;
        maybeFinish();
      };
    };
  });
});
