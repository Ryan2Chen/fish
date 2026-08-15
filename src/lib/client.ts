import { io, Socket } from "socket.io-client";

import { Card, FishSuit, fishSuitToString, Hand } from "lib/cards";
import { CFish as C, Data, Engine, SeatID } from "lib/cfish";
import { Protocol as P } from "lib/protocol";
import { RoomID, UserID } from "lib/server";

// how long an answer's resolution stays suspenseful before it's revealed
const ANSWER_REVEAL_MS = 1800;
// how long an emote bubble lingers over a player's avatar
const EMOTE_MS = 2500;

export class Client {
  engine: Engine | null = null;
  identity: P.User | null = null;
  log: string[] = [];
  socket: Socket;
  status: "waiting" | "connected" | "disconnected" = "waiting";
  users: P.User[] = [];

  chatLog: { user: P.User; message: string }[] = [];
  // emoji currently floating over a seat's avatar, cleared after EMOTE_MS
  activeEmotes: Partial<Record<SeatID, string>> = {};
  emoteTimers: Partial<Record<SeatID, ReturnType<typeof setTimeout>>> = {};

  cardAnimHook:
    | ((asker: SeatID, askee: SeatID, askedCard: Card) => void)
    | null = null;
  declareMoveHook:
    | ((srcId: string, srcIdx: number, destId: string, destIdx: number) => void)
    | null = null;
  onUpdate: ((state: this) => void) | null = null;
  resetShakeAnimHook: (() => void) | null = null;
  startGameHook: ((asker: SeatID) => void) | null = null;
  // true while the spin-wheel reveal is playing, so the rest of the UI can
  // hide "whose turn" spoilers (active highlight, turn banner) until it lands
  revealingFirstAsker: boolean = false;
  // set while an answer's outcome is being held back for suspense; holds
  // the frozen "asked" line to show in place of whatever comes next
  pendingReveal: string | null = null;
  pendingRevealTimer: ReturnType<typeof setTimeout> | null = null;
  // the most recent ask, kept around (independent of the live, mutable
  // engine.asker/askee) so the question arrow stays visible and pointing at
  // the right seats through the answer and past the turn transfer, instead
  // of vanishing the instant the phase moves on
  lastAsk: { asker: SeatID; askee: SeatID; card: Card } | null = null;

  constructor(
    readonly url: string,
    public room: RoomID,
    public name: string,
    readonly token: UserID
  ) {
    this.socket = io(url);

    this.socket.on("users", (users) => {
      this.users = users;
    });
    this.socket.on("join", (user) => this.join(user));
    this.socket.on("reset", (data) => this.reset(data));
    this.socket.on("event", (event) => this.update(event));
    this.socket.on("error", (error) => console.error(error));
    this.socket.on("rename", (user, name) => this.rename(user, name));
    this.socket.on("setAvatar", (user, avatar) => this.setAvatar(user, avatar));
    this.socket.on("leave", (user) => this.leave(user));
    this.socket.on("chat", (user, message) => this.receiveChat(user, message));
    this.socket.on("emote", (user, emoji) => this.receiveEmote(user, emoji));
  }

  // getters

  findUser(id: UserID | SeatID): P.User | null {
    const res =
      typeof id === "string" // true iff UserID
        ? this.users.filter((user) => user.id === id)
        : this.users.filter((user) => user.id === this.engine.userOf[id]);
    return res.length === 1 ? res[0] : null;
  }

  nameOf(id: UserID | SeatID): string {
    const user = this.findUser(id);
    return user ? user.name : "no one";
  }

  stringify(
    key:
      | "asker"
      | "askee"
      | "askedCard"
      | "declarer"
      | "declaredSuit"
      | "host"
      | "chooser"
  ): string {
    const obj = this.engine[key];
    if (key === "declaredSuit") {
      return fishSuitToString(this.engine[key]);
    } else if (key === "host") {
      return this.nameOf(this.engine[key]);
    } else if (typeof obj === "number") {
      const user = this.findUser(obj);
      return user?.id === this.identity?.id ? "you" : this.nameOf(obj);
    } else {
      return obj.toString();
    }
  }

  // protocol actions

  connect(): void {
    this.socket.on("connect", () => {
      this.status = "connected";
      this.socket.emit("join", this.room, this.name, this.token);
    });
  }

  join(user: P.User): void {
    if (this.token === user.id) {
      this.identity = user;
    }
    // reconnecting re-sends our own join; don't duplicate the roster entry
    if (!this.users.some((user_) => user_.id === user.id)) {
      this.users.push(user);
    }
    this.onUpdate?.(this);
  }

  rename(user: P.User, name: string): void {
    const user_ = this.findUser(user.id);
    user_.name = name;
    this.onUpdate?.(this);
  }

  setAvatar(user: P.User, avatar: string): void {
    const user_ = this.findUser(user.id);
    user_.avatar = avatar;
    this.onUpdate?.(this);
  }

  leave(user: P.User): void {
    const idx = this.users.findIndex((user_) => user_.id === user.id);
    this.users.splice(idx, 1);
    if (this.token === user.id) {
      this.status = "disconnected";
    }
    this.onUpdate?.(this);
  }

  receiveChat(user: P.User, message: string): void {
    this.chatLog.push({ user, message });
    this.onUpdate?.(this);
  }

  receiveEmote(user: P.User, emoji: string): void {
    const seat = this.engine?.seatOf(user.id);
    if (seat === null || seat === undefined) return;

    if (this.emoteTimers[seat] !== undefined) {
      clearTimeout(this.emoteTimers[seat]);
    }
    this.activeEmotes[seat] = emoji;
    this.emoteTimers[seat] = setTimeout(() => {
      delete this.emoteTimers[seat];
      delete this.activeEmotes[seat];
      this.onUpdate?.(this);
    }, EMOTE_MS);
    this.onUpdate?.(this);
  }

  // get redacted state and initiate engine
  reset(data: Data): void {
    if (this.engine === null) {
      this.engine = new Engine(data.rules);
    }

    this.engine.phase = data.phase;
    this.engine.users = data.users;
    this.engine.identity = data.identity;
    this.engine.host = data.host;

    this.engine.seats = data.seats;
    this.engine.userOf = data.userOf;
    this.engine.declarerOf = data.declarerOf;

    for (const seat of data.seats) {
      this.engine.handOf[seat] = data.handOf[seat]
        ? new Hand(data.handOf[seat])
        : null;
    }
    this.engine.handSize = data.handSize;
    if (this.engine.ownSeat && this.engine.ownHand) {
      this.engine.handSize[this.engine.ownSeat] = this.engine.ownHand.size;
    }

    this.engine.asker = data.asker;
    this.engine.askee = data.askee;
    this.engine.askedCard =
      data.askedCard && new Card(data.askedCard.cardSuit, data.askedCard.rank);
    this.engine.lastResponse = data.lastResponse;

    this.engine.declarer = data.declarer;
    this.engine.declaredSuit = data.declaredSuit;

    this.engine.declareBonus = data.declareBonus;
    this.engine.chooser = data.chooser;

    this.engine.paused = data.paused;
    this.engine.pausedUsers = data.pausedUsers;

    this.engine.chips = data.chips;

    this.engine.stats = data.stats;

    this.engine.activeTimerSeat = data.activeTimerSeat;
    this.engine.activeSince = data.activeSince;
    this.engine.usedMs = data.usedMs;

    this.engine.bets = data.bets;
    this.engine.lastBetResults = data.lastBetResults;

    this.onUpdate?.(this);
  }

  // process event from server
  update(event: P.Event): void {
    if (this.engine === null) return;
    const sfy = (key) => this.stringify(key);

    switch (event.type) {
      case "addUser":
        this.engine.addUser(event.user);
        break;
      case "seatAt":
        this.engine.seatAt(event.user, event.seat);
        break;
      case "unseatAt":
        this.engine.unseatAt(event.seat);
        break;
      case "swapSeats": {
        const nameA = this.nameOf(event.seatA);
        const nameB = this.nameOf(event.seatB);
        this.engine.swapSeats(event.seatA, event.seatB);
        this.log.push(`${nameA} and ${nameB} swapped seats`);
        break;
      }
      case "removeUser":
        this.engine.removeUser(event.user);
        break;
      case "setRules":
        this.engine.setRules(event.user, event.rules);
        break;
      case "startGame":
        this.engine.startGame(event.user);
        this.log = [];
        this.lastAsk = null;
        this.log.push(`${this.nameOf(event.user)} started the game`);
        break;
      case "startGameResponse":
        this.engine.startGameResponse(
          event.server,
          event.hand,
          event.handSizes,
          event.asker
        );
        // the broadcast (hand: null) and our own targeted copy (real hand)
        // both arrive; fire the spin animation once, off the personal one
        if (event.hand !== null) {
          this.revealingFirstAsker = true;
          this.startGameHook?.(event.asker);
        }
        break;
      case "ask":
        const card = new Card(event.card.cardSuit, event.card.rank);
        this.engine.ask(event.asker, event.askee, card);
        this.lastAsk = { asker: event.asker, askee: event.askee, card };
        this.log.push(
          `${sfy("asker")} asked ${sfy("askee")} for the ${sfy("askedCard")}`
        );
        break;
      case "answer": {
        // freeze today's "asked" line through the pause so the reveal
        // isn't spoiled by the engine (already updated below) moving on
        const askerName = sfy("asker");
        const askeeName = sfy("askee");
        const cardName = sfy("askedCard");
        const response = event.response;
        this.pendingReveal = `${askerName} asked ${askeeName} for the ${cardName}`;
        // a back-to-back ask/answer could otherwise land while a previous
        // reveal's timer is still pending, letting it fire late and clobber
        // this one -- clear it first, matching the same fix in SpinWheel
        if (this.pendingRevealTimer !== null) {
          clearTimeout(this.pendingRevealTimer);
        }

        this.engine.answer(event.askee, response);

        this.pendingRevealTimer = setTimeout(() => {
          this.pendingRevealTimer = null;
          this.pendingReveal = null;
          this.log.push(
            response
              ? `${askeeName} gave ${askerName} the ${cardName}`
              : `${askeeName} did not have the ${cardName}`
          );
          if (response) {
            const { asker, askee, askedCard } = this.engine;
            this.cardAnimHook?.(
              asker,
              askee,
              new Card(askedCard.cardSuit, askedCard.rank)
            );
          } else {
            this.resetShakeAnimHook?.();
          }
          this.onUpdate?.(this);
        }, ANSWER_REVEAL_MS);
        break;
      }
      case "initDeclare":
        this.engine.initDeclare(event.declarer, event.declaredSuit);
        this.log.push(
          `${sfy("declarer")} began declaring ${sfy("declaredSuit")}`
        );
        break;
      case "declareMove":
        if (this.engine.ownSeat !== this.engine.declarer) {
          this.declareMoveHook?.(
            event.srcId,
            event.srcIdx,
            event.destId,
            event.destIdx
          );
        }
        break;
      case "declare":
        this.engine.declare(event.declarer, event.owners);
        break;
      case "cancelDeclare": {
        // capture before the mutation -- declarer is null once cancelled
        const declarerName = sfy("declarer");
        this.engine.cancelDeclare(event.declarer);
        this.log.push(`${declarerName} backed out of declaring`);
        break;
      }
      case "declareResponse":
        this.engine.declareResponse(
          event.server,
          event.correct,
          event.handSizes
        );
        this.log.push(
          event.correct
            ? `${sfy("declarer")} correctly declared ${sfy("declaredSuit")}`
            : `${sfy("declarer")} incorrectly declared ${sfy("declaredSuit")}`
        );
        // a team can clinch the majority before every suit is declared;
        // only announce once the game has actually ended
        if (this.engine.allSuitsDeclared) {
          this.log.push(
            `team ${this.engine.seats
              .filter((seat) => this.engine.teamOf(seat) === this.engine.winner)
              .map((seat) => this.nameOf(seat))
              .join(", ")} won!`
          );
        }
        break;
      case "pass":
        this.engine.pass(event.passer, event.next);
        this.log.push(
          `${this.nameOf(event.passer)} passed the turn to ${sfy("asker")}`
        );
        break;
      case "assignTurn":
        this.engine.assignTurn(event.chooser, event.next);
        this.log.push(
          `${this.nameOf(event.chooser)} chose ${sfy("asker")} to take the turn`
        );
        break;
      case "pause":
        this.engine.pause(event.user);
        this.log.push(`${this.nameOf(event.user)} disconnected, game paused`);
        break;
      case "unpause": {
        const name = this.nameOf(event.user);
        this.engine.unpause(event.user);
        this.log.push(
          this.engine.paused ? `${name} reconnected` : `${name} reconnected, game resumed`
        );
        break;
      }
      case "adminReset":
        this.engine.adminReset(event.user);
        this.log = [];
        this.lastAsk = null;
        this.log.push(`${this.nameOf(event.user)} reset the game`);
        break;
      case "placeBet":
        this.engine.placeBet(event.user, event.category, event.pick, event.amount);
        this.log.push(`${this.nameOf(event.user)} placed a bet`);
        break;
    }
    this.onUpdate?.(this);
  }

  // convenience actions

  // we don't need to apply it to our own engine; server will update us
  attempt(event: P.Event): void {
    this.socket.emit("event", event);
  }

  attemptRename(name: string): void {
    this.socket.emit("rename", name);
  }

  attemptSetAvatar(avatar: string): void {
    this.socket.emit("setAvatar", avatar);
  }

  sendChat(message: string): void {
    this.socket.emit("chat", message);
  }

  sendEmote(emoji: string): void {
    this.socket.emit("emote", emoji);
  }

  seatAt(seat: SeatID): void {
    return this.attempt({
      type: "seatAt",
      user: this.engine.identity,
      seat: seat,
    });
  }

  unseatAt(): void {
    return this.attempt({
      type: "unseatAt",
      seat: this.engine.ownSeat,
    });
  }

  swapSeats(otherSeat: SeatID): void {
    return this.attempt({
      type: "swapSeats",
      seatA: this.engine.ownSeat,
      seatB: otherSeat,
    });
  }

  setRules(rules: C.Rules): void {
    return this.attempt({
      type: "setRules",
      user: this.engine.identity,
      rules: rules,
    });
  }

  startGame(shuffle: boolean = true): void {
    return this.attempt({
      type: "startGame",
      user: this.engine.identity,
      shuffle: shuffle,
    });
  }

  ask(askee: SeatID, card: Card): void {
    return this.attempt({
      type: "ask",
      asker: this.engine.ownSeat,
      askee: askee,
      card: card,
    });
  }

  answer(response: boolean): void {
    return this.attempt({
      type: "answer",
      askee: this.engine.ownSeat,
      response: response,
    });
  }

  initDeclare(declaredSuit: FishSuit): void {
    return this.attempt({
      type: "initDeclare",
      declarer: this.engine.ownSeat,
      declaredSuit: declaredSuit,
    });
  }

  declareMove(
    srcId: string,
    srcIdx: number,
    destId: string,
    destIdx: number
  ): void {
    return this.attempt({
      type: "declareMove",
      srcId: srcId,
      srcIdx: srcIdx,
      destId: destId,
      destIdx: destIdx,
    });
  }

  declare(owners: Record<string, SeatID>): void {
    return this.attempt({
      type: "declare",
      declarer: this.engine.ownSeat,
      owners: owners,
    });
  }

  cancelDeclare(): void {
    return this.attempt({
      type: "cancelDeclare",
      declarer: this.engine.ownSeat,
    });
  }

  pass(next: SeatID): void {
    return this.attempt({
      type: "pass",
      passer: this.engine.ownSeat,
      next: next,
    });
  }

  assignTurn(next: SeatID): void {
    return this.attempt({
      type: "assignTurn",
      chooser: this.engine.ownSeat,
      next: next,
    });
  }

  adminReset(): void {
    return this.attempt({
      type: "adminReset",
      user: this.engine.identity,
    });
  }

  placeBet(category: C.BetCategory, pick: number, amount: number): void {
    return this.attempt({
      type: "placeBet",
      user: this.engine.identity,
      category,
      pick,
      amount,
    });
  }
}
