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
      clients[0].engine.pausedUser.should.equal("b-token");
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
