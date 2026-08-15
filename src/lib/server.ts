import { Server as HTTPServer } from "http";
import { Server as IOServer, Socket } from "socket.io";

import { assert } from "lib/assert";
import { Card } from "lib/cards";
import { CFish as C, Engine, SeatID } from "lib/cfish";
import { Protocol as P } from "lib/protocol";

enum RoomIDBrand { _ = "" };
export type RoomID = RoomIDBrand & string;

enum UserIDBrand { _ = "" };
export type UserID = UserIDBrand & string;

export class Room {
  engine: Engine;
  users: P.User[] = [];
  disconnectTimers: Record<UserID, ReturnType<typeof setTimeout>> = {} as any;

  constructor(
    readonly id: RoomID,
    readonly socket: IOServer,
    public closeCallback: () => void,
    rules: C.Rules,
    readonly disconnectTimeoutMs: number = 60_000
  ) {
    this.engine = new Engine(rules);
  }

  // helpers

  findUser(id: UserID): P.User | null {
    const res = this.users.filter((user) => user.id === id);
    return res.length === 1 ? res[0] : null;
  }

  // to be handled by client
  toAll(event: string, ...args: any[]): void {
    this.socket.to(this.id).emit(event, ...args);
  }

  // to be handled by client engine
  event(event: P.Event): void {
    this.toAll("event", event);
  }

  toSeat(seat: SeatID, event: P.Event): void {
    const id = this.engine.userOf[seat];
    if (!assert(id !== null)) return;
    this.socket.to(id).emit("event", event);
  }

  // protocol actions

  join(user: P.User): void {
    if (!assert(this.findUser(user.id) === null)) return;
    this.socket.to(user.id).emit("users", this.users);
    this.users.push(user);

    this.engine.addUser(user.id);
    this.toAll("join", user);
    this.event({
      type: "addUser",
      user: user.id,
    });
  }

  rename(user: P.User, name: string): void {
    const user_ = this.findUser(user.id);
    if (!assert(user_ !== null)) return;
    user_.name = name.slice(0, 16);

    this.toAll("rename", user, name);
  }

  setAvatar(user: P.User, avatar: string): void {
    const user_ = this.findUser(user.id);
    if (!assert(user_ !== null)) return;
    user_.avatar = avatar;

    this.toAll("setAvatar", user, avatar);
  }

  // chat/emotes stay usable even while the game is paused (a disconnect
  // shouldn't also mute everyone else), so they bypass update()'s gate
  chat(user: P.User, message: string): void {
    if (!assert(this.findUser(user.id) !== null)) return;
    const trimmed = message.slice(0, 280).trim();
    if (!trimmed) return;

    this.toAll("chat", user, trimmed);
  }

  emote(user: P.User, emoji: string): void {
    if (!assert(this.findUser(user.id) !== null)) return;
    if (!P.EMOJIS.includes(emoji)) return;

    this.toAll("emote", user, emoji);
  }

  leave(user: P.User): void {
    const idx = this.users.findIndex((user_) => user_.id === user.id);
    if (!assert(idx !== -1)) return;
    this.users.splice(idx, 1);
    if (this.users.length === 0) {
      this.close();
    }

    this.engine.removeUser(user.id);
    this.toAll("leave", user);
    this.event({
      type: "removeUser",
      user: user.id,
    });
  }

  // a seated user's live connection dropped: pause instead of removing them
  // outright, and give them disconnectTimeoutMs to reconnect
  disconnect(user: P.User): void {
    const seat = this.engine.seatOf(user.id);
    if (seat === null) {
      // not seated (e.g. still in the lobby): nothing to preserve
      this.leave(user);
      return;
    }

    this.engine.pause(user.id);
    this.event({ type: "pause", user: user.id });

    this.disconnectTimers[user.id] = setTimeout(() => {
      delete this.disconnectTimers[user.id];
      this.engine.unpause();
      this.event({ type: "unpause" });
      this.leave(user);
    }, this.disconnectTimeoutMs);
  }

  // a previously-disconnected user's socket reconnected with the same token
  reconnect(user: P.User): void {
    // the fresh connection's local Client starts with an empty user list
    // and no identity; resend what join() would normally provide, but only
    // to this user -- everyone else already has them in their roster
    this.socket.to(user.id).emit("users", this.users);
    this.socket.to(user.id).emit("join", user);

    const timer = this.disconnectTimers[user.id];
    if (timer !== undefined) {
      clearTimeout(timer);
      delete this.disconnectTimers[user.id];
    }
    if (this.engine.paused && this.engine.pausedUser === user.id) {
      this.engine.unpause();
      this.event({ type: "unpause" });
    }
  }

  // destroy room
  close(): void {
    while (this.users.length > 0) {
      this.leave(this.users[0]);
    }
    this.closeCallback();
  }

  // forward redacted state to client
  reset(user: P.User): void {
    const data = this.engine.redactFor(user.id);
    this.socket.to(user.id).emit("reset", data);
  }

  // process event from client and broadcast
  update(user: P.User, event: P.Event): void {
    const seat = this.engine.seatOf(user.id);
    const error = (msg: string) => {
      this.socket.to(user.id).emit("error", msg);
    };
    if (this.engine.paused) return error("game is paused");
    let result = null;

    switch (event.type) {
      case "seatAt": {
        result = this.engine.seatAt(event.user, event.seat);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "unseatAt": {
        result = this.engine.unseatAt(event.seat);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "swapSeats": {
        // only the host or one of the two seats involved can trigger it --
        // no random player should be able to shuffle two others around
        const isHost = user.id === this.engine.host;
        const isInvolved = seat === event.seatA || seat === event.seatB;
        if (!isHost && !isInvolved) return error("bad user");
        result = this.engine.swapSeats(event.seatA, event.seatB);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "setRules": {
        if (user.id !== event.user) return error("bad user");
        result = this.engine.setRules(event.user, event.rules);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "startGame": {
        if (user.id !== event.user) return error("bad user");
        result = this.engine.startGame(event.user, event?.shuffle);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "ask": {
        if (seat !== event.asker) return error("bad user");
        const card = new Card(event.card.cardSuit, event.card.rank);
        result = this.engine.ask(event.asker, event.askee, card);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "answer": {
        if (seat !== event.askee) return error("bad user");
        result = this.engine.answer(event.askee, event.response);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "initDeclare": {
        if (seat !== event.declarer) return error("bad user");
        result = this.engine.initDeclare(event.declarer, event.declaredSuit);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "declareMove": {
        break;
      }
      case "declare": {
        if (seat !== event.declarer) return error("bad user");
        result = this.engine.declare(event.declarer, event.owners);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "cancelDeclare": {
        if (seat !== event.declarer) return error("bad user");
        result = this.engine.cancelDeclare(event.declarer);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "pass": {
        if (seat !== event.passer) return error("bad user");
        result = this.engine.pass(event.passer, event.next);
        if (result instanceof C.Error) return error (result.msg);
        break;
      }
      case "assignTurn": {
        if (seat !== event.chooser) return error("bad user");
        result = this.engine.assignTurn(event.chooser, event.next);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "adminReset": {
        if (user.id !== event.user) return error("bad user");
        result = this.engine.adminReset(event.user);
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
      case "placeBet": {
        if (user.id !== event.user) return error("bad user");
        result = this.engine.placeBet(
          event.user,
          event.category,
          event.pick,
          event.amount
        );
        if (result instanceof C.Error) return error(result.msg);
        break;
      }
    }

    this.event(event);

    switch (event.type) {
      case "seatAt": {
        this.reset(this.findUser(event.user));
        break;
      }
      case "swapSeats": {
        this.reset(this.findUser(this.engine.userOf[event.seatA]));
        this.reset(this.findUser(this.engine.userOf[event.seatB]));
        break;
      }
      case "startGame": {
        this.event({
          type: "startGameResponse",
          server: null,
          hand: null,
          handSizes: this.engine.redactedHandSize,
          asker: this.engine.asker,
        });
        for (const seat_ of this.engine.seats) {
          this.toSeat(seat_, {
            type: "startGameResponse",
            server: null,
            hand: this.engine.handOf[seat_],
            handSizes: this.engine.redactedHandSize,
            asker: this.engine.asker,
          });
        }
        break;
      }
      case "declare": {
        this.event({
          type: "declareResponse",
          server: null,
          correct: result,
          handSizes: this.engine.redactedHandSize,
        });
        break;
      }
    }
  }
}

export class Server {
  clients: Record<UserID, Socket> = {} as any;
  roomOf: Record<UserID, RoomID> = {} as any;
  rooms: Record<RoomID, Room> = {} as any;
  socket: IOServer;

  constructor(server: HTTPServer, readonly disconnectTimeoutMs: number = 60_000) {
    this.socket = new IOServer(server);

    this.socket.on("connect", (client) => {
      // identity isn't known until the client tells us its persistent
      // token, so the rest of the listeners are wired up inside "join"
      client.on("join", (room, name, token) => {
        const id = token as UserID;
        this.clients[id] = client;
        // an explicit room named after the token lets us address this
        // persistent user directly even after their connection id changes
        client.join(id);

        client.on("reset", () => this.reset(id));
        client.on("event", (event) => this.event(id, event));
        client.on("rename", (name) => this.rename(id, name));
        client.on("setAvatar", (avatar) => this.setAvatar(id, avatar));
        client.on("chat", (message) => this.chat(id, message));
        client.on("emote", (emoji) => this.emote(id, emoji));
        client.on("disconnect", () => this.disconnect(id));

        this.join(id, room, name);
      });
    });
  }

  userAndRoom(
    id: UserID
  ): {
    user: P.User | null;
    room: RoomID | null;
  } {
    const room = this.roomOf[id] ?? null;
    const user = this.rooms[room]?.findUser(id);
    return { user, room };
  }

  join(id: UserID, room: RoomID, name: string): void {
    if (this.rooms[room] === undefined) {
      this.rooms[room] = new Room(
        room,
        this.socket,
        () => this.close(room),
        C.defaultRules,
        this.disconnectTimeoutMs
      );
    }
    this.clients[id].join(room);
    this.roomOf[id] = room;

    // a token we've seen before in this room is a reconnect, not a new join
    const existing = this.rooms[room].findUser(id);
    if (existing !== null) {
      this.rooms[room].reconnect(existing);
    } else {
      this.rooms[room].join({ id, name: name.slice(0, 16) });
    }
    this.reset(id);
  }

  reset(id: UserID): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.reset(user);
  }

  event(id: UserID, event: P.Event): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.update(user, event);
  }

  rename(id: UserID, name: string): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.rename(user, name);
  }

  setAvatar(id: UserID, avatar: string): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.setAvatar(user, avatar);
  }

  chat(id: UserID, message: string): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.chat(user, message);
  }

  emote(id: UserID, emoji: string): void {
    const { user, room } = this.userAndRoom(id);
    this.rooms[room]?.emote(user, emoji);
  }

  disconnect(id: UserID): void {
    const { user, room } = this.userAndRoom(id);
    if (user === null) return;
    this.rooms[room]?.disconnect(user);
  }

  close(room: RoomID): void {
    if (!assert(this.rooms[room] !== undefined)) return;
    delete this.rooms[room];
  }

  // public lobby list: rooms still gathering players, so a browsable
  // "join a game" screen has something to show
  listRooms(): { id: RoomID; numSeated: number; numPlayers: number }[] {
    return Object.values(this.rooms)
      .filter((room) => room.engine.phase === C.Phase.WAIT)
      .map((room) => ({
        id: room.id,
        numSeated: room.engine.numSeated,
        numPlayers: room.engine.rules.numPlayers,
      }));
  }
}
