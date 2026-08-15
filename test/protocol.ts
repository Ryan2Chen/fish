import { should } from "chai";
import "chai/register-should";
import { createServer } from "http";

import * as C from "./common";
import { CFish } from "lib/cfish";
import { Client } from "lib/client";
import { Server } from "lib/server";

describe("Client/Server", () => {
  let clients: Client[] = [],
    server,
    http,
    url,
    firstAsker: number,
    askee: number;

  // seats 0-5 each hold exactly one low-clubs card, ranks 2-7 respectively,
  // in this fixed (unshuffled) deck -- handy since the first asker is now
  // chosen randomly by the server, so tests can't hardcode "asker: 0"
  const lowClub = (seat: number) =>
    [C.C_2, C.C_3, C.C_4, C.C_5, C.C_6, C.C_7][seat];

  before((done) => {
    http = createServer();
    server = new Server(http);
    http.listen(() => {
      const port = (http.address() as any).port;
      url = `http://localhost:${port}`;
      clients.push(new Client(url, "test" as any, "a", "a-token" as any));
      clients[0].connect();
      clients[0].socket.on("connect", () => done());
    });
  });

  after(() => {
    for (const client of clients) client.socket.disconnect();
    server.socket.close();
    http.close();
  });

  it("connects", (done) => {
    let run = false;
    clients[0].socket.on("join", () => {
      if (run) return;

      clients[0].identity.name.should.equal("a");
      server.rooms["test"].id.should.equal("test");

      run = true;
      done();
    });
  });

  it("has rooms", (done) => {
    clients[0].socket.on("test", (msg) => {
      msg.should.equal("hi");
      done();
    });
    server.rooms["test"].toAll("test", "hi");
  });

  it("connects more clients", (done) => {
    let count = 1;
    clients[0].socket.on("join", () => {
      if (count === 6) return;
      count += 1;
      if (count === 6) done();
    });

    clients.push(new Client(url, "test" as any, "b", "b-token" as any));
    clients.push(new Client(url, "test" as any, "c", "c-token" as any));
    clients.push(new Client(url, "test" as any, "d", "d-token" as any));
    clients.push(new Client(url, "test" as any, "e", "e-token" as any));
    clients.push(new Client(url, "test" as any, "f", "f-token" as any));
    for (let i = 1; i < 6; i++) {
      clients[i].connect();
    }
  });

  it("changes rules", (done) => {
    let run = false;
    clients[1].socket.on("event", (event) => {
      if (run) return;
      run = true;
      done();
    });

    clients[0].setRules({
      ...clients[0].engine.rules,
      log: CFish.LogRule.EVERYTHING,
    });
  });

  it("starts games", (done) => {
    let count = 0;
    clients[0].socket.on("event", (event) => {
      if (event.type !== "seatAt") return;
      count += 1;
      if (count !== 6) return;
      clients[0].startGame(false);
    });

    let count1 = 0;
    clients[0].socket.on("event", (event) => {
      if (event.type !== "startGameResponse") return;
      count1 += 1;
      if (count1 !== 2) return;
      firstAsker = clients[0].engine.asker;
      askee = (firstAsker + 1) % 6; // always the opposing team
      done();
    });

    for (let i = 0; i < 6; i++) {
      clients[i].attempt({
        type: "seatAt",
        user: clients[i].identity.id,
        seat: i,
      });
    }
  });

  it("runs a question", (done) => {
    let run = false;
    clients[0].socket.on("event", (event) => {
      if (run) return;
      run = true;
      done();
    });

    clients[firstAsker].attempt({
      type: "ask",
      asker: firstAsker,
      askee: askee,
      card: lowClub(askee), // askee truly owns this, so the answer is "yes"
    });
  });

  it("runs an answer", (done) => {
    let run = false;
    clients[2].socket.on("event", (event) => {
      if (run) return;
      run = true;
      done();
    });

    clients[askee].attempt({
      type: "answer",
      askee: askee,
      response: true,
    });
  });

  it("enforces rules", (done) => {
    // asking for a card you already hold is always rejected
    clients[firstAsker].engine.handOf[firstAsker]
      .includes(lowClub(firstAsker))
      .should.equal(true);
    clients[firstAsker].socket.once("error", (msg) => {
      msg.should.equal("hand has asked card");
      done();
    });
    clients[firstAsker].attempt({
      type: "ask",
      asker: firstAsker,
      askee: askee,
      card: lowClub(firstAsker),
    });
  });

  it("runs an answer correctly", () => {
    // a player's own hand is only visible in their own redacted view
    clients[firstAsker].engine.handOf[firstAsker]
      .includes(lowClub(askee))
      .should.equal(true);
    clients[2].engine.handSize[firstAsker].should.equal(10);
    clients[2].engine.handSize[askee].should.equal(8);
  });
});
