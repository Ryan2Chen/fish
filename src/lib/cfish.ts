import _ from "lodash";

import { Card, FishSuit, genDeck, genFishSuit, Hand } from "lib/cards";
import { UserID } from "lib/server";

export type SeatID = number; // seat index (0, 1, 2, ...)

export namespace CFish {
  export enum Phase {
    WAIT, // between rounds
    ASK, // waiting for someone to ask
    ANSWER, // waiting for someone to answer
    DECLARE, // waiting for someone to declare
    PASS, // someone who's out to give turn to teammate
    CHOOSE, // team with a banked declare bonus is assigning the turn
  }

  export enum Team {
    FIRST = 0, // goes first
    SECOND,
  }

  // who knows hand sizes?
  export enum HandSizeRule {
    PUBLIC,
    SECRET,
  }

  // what should be shown in the log?
  export enum LogRule {
    LAST_ACTION,
    LAST_TWO,
    EVERYTHING,
  }

  // side bets, placed during WAIT and resolved once the next hand ends.
  // "winner" picks a Team, "mostSnipes"/"mostStolen" pick a SeatID -- pick
  // is just a number either way, interpreted per category
  export enum BetCategory {
    WINNER,
    MOST_SNIPES,
    MOST_STOLEN,
  }

  export type Bet = {
    user: UserID;
    category: BetCategory;
    pick: number;
    amount: number;
  };

  // a settled bet, kept around for the next end screen to show
  export type BetResult = Bet & { correct: boolean; payout: number };

  // one seat's running totals for the current hand
  export type SeatStats = {
    cardsWon: number; // successful asks made (cards taken from someone else)
    cardsLost: number; // times successfully asked (a card taken from them)
    declaresCorrect: number;
    declaresIncorrect: number;
    asksMade: number; // every ask attempted, win or lose (feeds the timer increment)
  };

  export const emptySeatStats = (): SeatStats => ({
    cardsWon: 0,
    cardsLost: 0,
    declaresCorrect: 0,
    declaresIncorrect: 0,
    asksMade: 0,
  });

  export type Rules = {
    numPlayers: number;
    handSize: HandSizeRule;
    log: LogRule;
    // chips each player antes per game; winners take buyIn * numPlayers *
    // margin / FISH_SUITS.length from losers, split across their team
    buyIn: number;
    startingChips: number;
    // team chess-clock, purely informational -- hitting zero doesn't force
    // a pass or a loss, it's just a number the UI can show
    timerEnabled: boolean;
    timerBudgetMs: number; // starting budget per team
    timerIncrementMs: number; // credited to a team's budget per ask made
  };

  export const defaultRules: Rules = {
    numPlayers: 6,
    handSize: HandSizeRule.PUBLIC,
    log: LogRule.LAST_ACTION,
    buyIn: 10,
    startingChips: 100,
    timerEnabled: false,
    timerBudgetMs: 10 * 60 * 1000,
    timerIncrementMs: 3 * 1000,
  };

  export class Error {
    constructor(readonly msg?: string) {}

    toString(): string {
      return this.msg;
    }
  }

  export type Result<T = void> = T | Error;
}

export class Data {
  rules: CFish.Rules;

  phase: CFish.Phase = CFish.Phase.WAIT;
  // all users in the room
  users: UserID[] = [];
  // whose data is this? null is server
  identity: UserID | null = null;
  host: UserID | null = null;

  // seats, clockwise; seats[0] should always be host
  // even-indexed seats are in CFish.Team.FIRST
  seats: SeatID[] = [];
  userOf: Record<SeatID, UserID | null> = {} as any;
  // only partial record; no other record can have undefined
  declarerOf: Partial<Record<FishSuit, CFish.Team>> = {} as any;

  // these are index-dependent and player-agnostic
  // hands; maps to null for private hands
  handOf: Record<SeatID, Hand | null> = {} as any;
  // hand size; always public
  handSize: Record<SeatID, number | null> = {} as any;

  // asker asks askedCard from askee, initially null
  asker: SeatID | null = null;
  askee: SeatID | null = null;
  askedCard: Card | null = null;

  // declarer declares declaredSuit, initially null
  declarer: SeatID | null = null;
  declaredSuit: FishSuit | null = null;

  // teams holding an unspent "choose the next asker" bonus from a
  // successful declare, banked until the turn would next transfer to them
  declareBonus: Partial<Record<CFish.Team, true>> = {} as any;
  // seat spending a banked bonus to pick the next asker, initially null
  chooser: SeatID | null = null;

  // true while waiting on one or more disconnected players to reconnect
  paused: boolean = false;
  // everyone we're currently waiting on. plural: a single pausedUser field
  // meant a second disconnect overwrote tracking of the first, so their
  // reconnect alone would wrongly clear "paused" while the first player
  // was still gone -- the game would look resumed until that first
  // player's own timeout silently removed their seat later, mid-hand
  pausedUsers: UserID[] = [];

  // chip balance per user; persists across games in the same room
  chips: Record<UserID, number> = {} as any;

  // pending side bets, placed during WAIT; resolved (and cleared into
  // lastBetResults) once the hand that follows ends
  bets: CFish.Bet[] = [];
  lastBetResults: CFish.BetResult[] = [];

  // the last response
  lastResponse:
    | "good ask"
    | "bad ask"
    | "good declare"
    | "bad declare"
    | "null" = null;

  // per-seat running totals for the current hand, for the end-of-game
  // stats screen; cleared on startGame/adminReset like everything else
  stats: Record<SeatID, CFish.SeatStats> = {} as any;

  // chess-clock bookkeeping: which seat's clock is currently running (the
  // live activeSeat, captured so the next transition knows who to credit),
  // when it started, and each seat's accumulated decision time so far
  activeTimerSeat: SeatID | null = null;
  activeSince: number | null = null;
  usedMs: Record<SeatID, number> = {} as any;
}

// client/server agnostic cfish engine
// client and server use the same state machine
// upon connect server pushes all state info to client engine
// client sends action to client engine and server
// server sends action to server engine and clients

export class Engine extends Data {
  constructor(rules: CFish.Rules = CFish.defaultRules) {
    super();
    this.rules = { ...rules };
    this.seats = _.range(this.rules.numPlayers);
    for (const seat of this.seats) {
      this.userOf[seat] = null;
      this.handOf[seat] = null;
      this.handSize[seat] = 0;
    }
  }

  // getters

  get activeSeat(): SeatID | null {
    switch (this.phase) {
      case CFish.Phase.WAIT:
        return this.seatOf(this.host) ?? null;
      case CFish.Phase.ASK:
      case CFish.Phase.PASS:
        return this.asker;
      case CFish.Phase.ANSWER:
        return this.askee;
      case CFish.Phase.DECLARE:
        return this.declarer;
      case CFish.Phase.CHOOSE:
        return this.chooser;
    }
    return null;
  }

  // call after any action that might change activeSeat: credits elapsed
  // time to whoever's clock was running, then starts the next one
  private tickTimer(): void {
    const now = Date.now();
    if (this.activeTimerSeat !== null && this.activeSince !== null) {
      this.usedMs[this.activeTimerSeat] =
        (this.usedMs[this.activeTimerSeat] ?? 0) + (now - this.activeSince);
    }
    this.activeTimerSeat = this.activeSeat;
    this.activeSince = this.activeTimerSeat !== null ? now : null;
  }

  // a team's remaining chess-clock budget; can go negative once it runs
  // out -- purely informational, nothing forces a pass or a loss on it
  remainingMsFor(team: CFish.Team): number {
    const used = this.playersOf(team).reduce(
      (sum, seat) => sum + (this.usedMs[seat] ?? 0),
      0
    );
    const asks = this.playersOf(team).reduce(
      (sum, seat) => sum + (this.stats[seat]?.asksMade ?? 0),
      0
    );
    return this.rules.timerBudgetMs + asks * this.rules.timerIncrementMs - used;
  }

  get numSeated(): number {
    return this.seats.filter((seat) => this.userOf[seat] !== null).length;
  }

  get ownSeat(): SeatID | null {
    return this.seatOf(this.identity);
  }

  get ownHand(): Hand | null {
    return this.handOf[this.ownSeat] ?? null;
  }

  get redactedHandSize(): Record<SeatID, number | null> {
    if (this.rules.handSize === CFish.HandSizeRule.PUBLIC) {
      return this.handSize;
    }
    const res = {};
    for (const seat of this.seats) {
      res[seat] = this.handSize[seat] === 0 ? 0 : null;
    }
    return res;
  }

  // a team can clinch a mathematical majority before every suit is
  // declared; the game itself keeps going regardless, so a 9-0 sweep
  // stays possible and chip payouts reflect the true final margin
  get winner(): CFish.Team | null {
    const bound = Card.FISH_SUITS.length / 2;
    if (this.scoreOf(CFish.Team.FIRST) > bound) return CFish.Team.FIRST;
    if (this.scoreOf(CFish.Team.SECOND) > bound) return CFish.Team.SECOND;
    return null;
  }

  get allSuitsDeclared(): boolean {
    return Object.keys(this.declarerOf).length === Card.FISH_SUITS.length;
  }

  indexOf(seat: SeatID): number {
    return this.seats.findIndex((seat_) => seat_ === seat);
  }

  seatOf(user: UserID): SeatID | null {
    const res = this.seats.filter((seat) => this.userOf[seat] === user);
    return res.length === 1 ? res[0] : null;
  }

  teamOf(seat: SeatID): CFish.Team | null {
    return seat % 2 === 0 ? CFish.Team.FIRST : CFish.Team.SECOND;
  }

  playersOf(team: CFish.Team): SeatID[] {
    return this.seats.filter((seat) => seat % 2 === Number(team));
  }

  scoreOf(team: CFish.Team): number {
    return Card.FISH_SUITS.filter((suit) => this.declarerOf[suit] === team)
      .length;
  }

  // suits credited to seat's team, regardless of which teammate declared it
  setsFor(seat: SeatID): number {
    return this.scoreOf(this.teamOf(seat));
  }

  // best all-around performer: net cards gained from asking, weighted
  // heavily toward correct declares (worth more than a single card) and
  // penalized for incorrect ones (a costly unforced error)
  get mvpSeat(): SeatID | null {
    const seated = this.seats.filter((seat) => this.userOf[seat] !== null);
    if (seated.length === 0) return null;

    const scoreOf = (seat: SeatID) => {
      const s = this.stats[seat] ?? CFish.emptySeatStats();
      return s.cardsWon - s.cardsLost + s.declaresCorrect * 3 - s.declaresIncorrect * 2;
    };
    return seated.reduce((best, seat) =>
      scoreOf(seat) > scoreOf(best) ? seat : best
    );
  }

  // lighter, just-for-fun award: most cards successfully asked for
  get aceSeat(): SeatID | null {
    const seated = this.seats.filter((seat) => this.userOf[seat] !== null);
    if (seated.length === 0) return null;

    const wonOf = (seat: SeatID) => this.stats[seat]?.cardsWon ?? 0;
    return seated.reduce((best, seat) => (wonOf(seat) > wonOf(best) ? seat : best));
  }

  // rotated such that user appears first
  rotatedSeats(user: UserID = this.identity): SeatID[] {
    const seat = this.seatOf(user);
    if (seat === null) return this.seats;
    const index = this.indexOf(seat);
    return this.seats.slice(index).concat(this.seats.slice(0, index));
  }

  // dupe and redact state
  redactFor(user: UserID): Data {
    const res = new Data();
    res.rules = { ...this.rules };

    res.phase = this.phase;
    res.users = this.users;
    res.identity = user;
    res.host = this.host;

    res.seats = this.seats;
    res.userOf = this.userOf;
    res.declarerOf = this.declarerOf;

    const seat_ = this.seatOf(user);
    for (const seat of this.seats) {
      res.handOf[seat] = seat === seat_ ? this.handOf[seat] : null;
    }
    res.handSize = this.handSize;

    res.asker = this.asker;
    res.askee = this.askee;
    res.askedCard = this.askedCard;
    res.lastResponse = this.lastResponse;

    res.declarer = this.declarer;
    res.declaredSuit = this.declaredSuit;

    res.declareBonus = this.declareBonus;
    res.chooser = this.chooser;

    res.paused = this.paused;
    res.pausedUsers = this.pausedUsers;

    res.chips = this.chips;

    res.stats = this.stats;

    res.activeTimerSeat = this.activeTimerSeat;
    res.activeSince = this.activeSince;
    res.usedMs = this.usedMs;

    res.bets = this.bets;
    res.lastBetResults = this.lastBetResults;

    return res;
  }

  // protocol actions

  addUser(user: UserID): CFish.Result {
    if (this.users.includes(user))
      return new CFish.Error("user already joined");

    this.users.push(user);
    if (this.host === null) this.host = user;
    if (this.chips[user] === undefined) this.chips[user] = this.rules.startingChips;
  }

  seatAt(user: UserID, seat: SeatID): CFish.Result {
    if (!this.users.includes(user))
      return new CFish.Error("user doesn't exist");
    if (this.userOf[seat] !== null) return new CFish.Error("seat occupied");
    if (this.seatOf(user) !== null)
      return new CFish.Error("user already seated");

    this.userOf[seat] = user;
  }

  unseatAt(seat: SeatID): CFish.Result {
    if (this.userOf[seat] === null) return new CFish.Error("seat is empty");

    this.userOf[seat] = null;
  }

  // WAIT -> WAIT
  // lets two seated players trade seats before a hand starts (e.g. to
  // rebalance who ends up on which team) without the race of a manual
  // stand-up-then-sit-down leaving either seat briefly grabbable
  swapSeats(seatA: SeatID, seatB: SeatID): CFish.Result {
    if (this.phase !== CFish.Phase.WAIT) return new CFish.Error("bad phase");
    if (seatA === seatB) return new CFish.Error("same seat");
    if (this.userOf[seatA] === null || this.userOf[seatB] === null)
      return new CFish.Error("both seats must be occupied");

    const temp = this.userOf[seatA];
    this.userOf[seatA] = this.userOf[seatB];
    this.userOf[seatB] = temp;
  }

  removeUser(user: UserID): CFish.Result {
    if (!this.users.includes(user))
      return new CFish.Error("user doesn't exist");

    _.remove(this.users, (user_) => user_ === user);

    const seat = this.seatOf(user);
    if (seat !== null) {
      this.unseatAt(seat);
    }
    if (user === this.host) {
      this.host = null;
      for (const seat_ of this.seats) {
        if (this.userOf[seat_] !== null) {
          this.host = this.userOf[seat_];
          // this.seats = this.rotatedSeats(this.host);
          break;
        }
      }
    }
  }

  // state machine actions
  // first argument is always user/seat initiating

  // WAIT -> WAIT
  setRules(user: UserID, rules: CFish.Rules): CFish.Result {
    if (this.phase !== CFish.Phase.WAIT) return new CFish.Error("bad phase");
    if (this.host !== user) return new CFish.Error("not host");

    this.rules = { ...rules };
  }

  // WAIT -> ASK
  // server response: player hands
  startGame(user: UserID, shuffle: boolean = true): CFish.Result {
    if (this.phase !== CFish.Phase.WAIT) return new CFish.Error("bad phase");
    if (this.host !== user) return new CFish.Error("not host");
    if (this.numSeated !== this.rules.numPlayers)
      return new CFish.Error("not all seated");

    if (this.identity === null) {
      const deck = shuffle ? _.shuffle([...genDeck()]) : [...genDeck()];
      const deal = _.unzip(_.chunk(deck, this.rules.numPlayers));
      for (const [seat, hand] of _.zip(this.seats, deal)) {
        this.handOf[seat] = new Hand(hand);
        this.handSize[seat] = this.handOf[seat].size;
      }
    }

    this.declarerOf = {} as any;
    this.asker = null;
    this.askee = null;
    this.askedCard = null;
    this.declarer = null;
    this.declaredSuit = null;

    this.declareBonus = {} as any;
    this.chooser = null;

    this.stats = {} as any;
    for (const seat of this.seats) {
      this.stats[seat] = CFish.emptySeatStats();
    }

    this.activeTimerSeat = null;
    this.activeSince = null;
    this.usedMs = {} as any;

    this.phase = CFish.Phase.ASK;

    if (this.identity === null) {
      // picked once, here, so every client converges on the same seat
      // instead of each independently rolling their own random asker
      const asker = this.seats[Math.floor(Math.random() * this.seats.length)];
      this.startGameResponse(null, null, this.handSize, asker);
    }
  }

  startGameResponse(
    server: null,
    hand: Hand | null,
    handSizes: Record<SeatID, number>,
    asker: SeatID
  ): CFish.Result {
    if (this.ownSeat !== null && hand !== null) {
      this.handOf[this.ownSeat] = new Hand(hand);
    }
    this.handSize = handSizes;
    if (this.ownHand !== null) {
      this.handSize[this.ownSeat] = this.ownHand.size;
    }
    this.asker = asker;
    this.tickTimer();
  }

  // ASK -> ANSWER
  ask(asker: SeatID, askee: SeatID, card: Card): CFish.Result {
    if (this.phase !== CFish.Phase.ASK) return new CFish.Error("bad phase");
    if (this.asker !== asker) return new CFish.Error("not asker");
    if (this.teamOf(asker) === this.teamOf(askee))
      return new CFish.Error("same team");
    if (
      this.handOf[asker] !== null &&
      !this.handOf[asker].hasSuit(card.fishSuit)
    )
      return new CFish.Error("hand doesn't have suit");
    if (this.handOf[asker] !== null && this.handOf[asker].includes(card))
      return new CFish.Error("hand has asked card");

    this.askee = askee;
    this.askedCard = card;
    this.phase = CFish.Phase.ANSWER;
    this.stats[asker].asksMade += 1;
    this.tickTimer();
  }

  // ANSWER -> ASK
  answer(askee: SeatID, response: boolean): CFish.Result {
    if (this.phase !== CFish.Phase.ANSWER) return new CFish.Error("bad phase");
    if (this.askee !== askee) return new CFish.Error("not askee");
    if (
      this.handOf[askee] !== null &&
      this.handOf[askee].includes(this.askedCard) !== response
    )
      return new CFish.Error("bad response");

    if (response) {
      if (this.handOf[this.asker] !== null) {
        this.handOf[this.asker].insert(this.askedCard);
      }
      if (this.handOf[this.askee] !== null) {
        this.handOf[this.askee].remove(this.askedCard);
      }
      if (this.handSize[this.asker] !== null) {
        this.handSize[this.asker] += 1;
      }
      if (this.handSize[this.askee] !== null) {
        this.handSize[this.askee] -= 1;
      }
      this.stats[this.asker].cardsWon += 1;
      this.stats[this.askee].cardsLost += 1;
    }

    this.lastResponse = response ? "good ask" : "bad ask";

    if (response) {
      this.phase = CFish.Phase.ASK;
    } else {
      const receivingTeam = this.teamOf(askee);
      if (this.declareBonus[receivingTeam]) {
        delete this.declareBonus[receivingTeam];
        this.chooser = askee;
        this.phase = CFish.Phase.CHOOSE;
      } else {
        this.asker = askee;
        this.phase = CFish.Phase.ASK;
      }
    }
    this.tickTimer();
  }

  // CHOOSE -> ASK
  assignTurn(chooser: SeatID, next: SeatID): CFish.Result {
    if (this.phase !== CFish.Phase.CHOOSE) return new CFish.Error("bad phase");
    if (this.chooser !== chooser) return new CFish.Error("not chooser");
    if (this.teamOf(chooser) !== this.teamOf(next))
      return new CFish.Error("different teams");
    if (this.handSize[next] === 0) return new CFish.Error("empty hand");

    this.asker = next;
    this.chooser = null;
    this.phase = CFish.Phase.ASK;
    this.tickTimer();
  }

  // any phase -> itself, paused
  // server-driven: called when a seated player disconnects/reconnects
  pause(user: UserID): CFish.Result {
    if (!this.pausedUsers.includes(user)) this.pausedUsers.push(user);
    this.paused = true;
  }

  // only this one user's wait is over -- stay paused if anyone else is
  // still out (see the pausedUsers field comment for why this matters)
  unpause(user: UserID): CFish.Result {
    this.pausedUsers = this.pausedUsers.filter((u) => u !== user);
    this.paused = this.pausedUsers.length > 0;
  }

  // ASK / PASS -> DECLARE
  initDeclare(declarer: SeatID, declaredSuit: FishSuit): CFish.Result {
    if (this.phase !== CFish.Phase.ASK && this.phase !== CFish.Phase.PASS)
      return new CFish.Error("bad phase");
    if (this.declarerOf[declaredSuit] !== undefined)
      return new CFish.Error("suit declared");

    this.declarer = declarer;
    this.declaredSuit = declaredSuit;
    this.phase = CFish.Phase.DECLARE;
    this.tickTimer();
  }

  // DECLARE -> ASK / PASS
  // backs out of a declare in progress (e.g. the wrong suit was picked by
  // mistake) without it counting as a declaration either way
  cancelDeclare(declarer: SeatID): CFish.Result {
    if (this.phase !== CFish.Phase.DECLARE) return new CFish.Error("bad phase");
    if (this.declarer !== declarer) return new CFish.Error("not declarer");

    this.declarer = null;
    this.declaredSuit = null;
    this.phase = this.handSize[this.asker] === 0 ? CFish.Phase.PASS : CFish.Phase.ASK;
    this.tickTimer();
  }

  // DECLARE -> ASK / PASS / WAIT
  // owners: Record<card as string, SeatID>
  // server response: correct or not
  declare(
    declarer: SeatID,
    owners: Record<string, SeatID>
  ): CFish.Result<boolean> {
    if (this.phase !== CFish.Phase.DECLARE) return new CFish.Error("bad phase");
    if (this.declarer !== declarer) return new CFish.Error("not declarer");

    const team = this.teamOf(declarer);
    let correct = true;

    for (const card of genFishSuit(this.declaredSuit)) {
      const owner = owners[card.toString()];
      if (owner === undefined) return new CFish.Error("undefined owner");
      if (this.teamOf(owner) !== team) return new CFish.Error("bad owner team");
      if (this.handOf[owner] !== null) {
        correct &&= this.handOf[owner].includes(card);
      }
    }

    for (const seat of this.seats) {
      if (this.handOf[seat] !== null) {
        this.handOf[seat].removeSuit(this.declaredSuit);
        this.handSize[seat] = this.handOf[seat].size;
      }
    }

    if (this.identity === null) {
      this.declareResponse(null, correct, this.handSize);
    }

    return correct;
  }

  declareResponse(
    server: null,
    correct: boolean,
    handSizes: Record<SeatID, number>
  ): CFish.Result {
    const team = this.teamOf(this.declarer);
    const scorer = correct ? team : 1 - team;

    this.declarerOf[this.declaredSuit] = scorer as CFish.Team;
    if (correct) {
      this.stats[this.declarer].declaresCorrect += 1;
    } else {
      this.stats[this.declarer].declaresIncorrect += 1;
    }

    this.handSize = handSizes;
    if (this.ownHand !== null) {
      this.handSize[this.ownSeat] = this.ownHand.size;
    }

    if (this.allSuitsDeclared) {
      this.phase = CFish.Phase.WAIT;
      this.settleChips(this.winner);
      this.settleBets();
    } else if (correct && this.teamOf(this.asker) === team) {
      // the declaring team already holds the turn, so there's no future
      // transfer for the bonus to wait for -- spend it immediately instead
      // of banking it, or it'd sit unused until the other team happens to
      // fail an ask back to this team
      this.chooser = this.declarer;
      this.phase = CFish.Phase.CHOOSE;
    } else {
      if (correct) {
        this.declareBonus[team] = true;
      }
      this.phase =
        this.handSize[this.asker] === 0 ? CFish.Phase.PASS : CFish.Phase.ASK;
    }

    this.lastResponse = correct ? "good declare" : "bad declare";
    this.tickTimer();
  }

  // winners collectively take buyIn * numPlayers * margin / numSuits chips
  // from losers, split evenly across each team; a 9-0 sweep takes the whole
  // pot, a narrow 5-4 win takes only a sliver of it
  settleChips(winner: CFish.Team): void {
    const margin = Math.abs(
      this.scoreOf(CFish.Team.FIRST) - this.scoreOf(CFish.Team.SECOND)
    );
    const pot = this.rules.buyIn * this.rules.numPlayers;
    const payout = Math.round((pot * margin) / Card.FISH_SUITS.length);

    const winners = this.playersOf(winner).filter(
      (seat) => this.userOf[seat] !== null
    );
    const losers = this.playersOf(1 - winner).filter(
      (seat) => this.userOf[seat] !== null
    );
    if (winners.length === 0 || losers.length === 0) return;

    const gain = Math.floor(payout / winners.length);
    const loss = Math.floor(payout / losers.length);
    for (const seat of winners) {
      const user = this.userOf[seat];
      this.chips[user] = (this.chips[user] ?? 0) + gain;
    }
    for (const seat of losers) {
      const user = this.userOf[seat];
      this.chips[user] = (this.chips[user] ?? 0) - loss;
    }
  }

  // any phase -> itself
  // side bet on the outcome of the hand currently in progress; only open
  // during WAIT (between hands), so no one's betting with inside info
  placeBet(
    user: UserID,
    category: CFish.BetCategory,
    pick: number,
    amount: number
  ): CFish.Result {
    if (this.phase !== CFish.Phase.WAIT) return new CFish.Error("bad phase");
    if (!Number.isFinite(amount) || amount <= 0)
      return new CFish.Error("bad amount");
    if ((this.chips[user] ?? 0) < amount)
      return new CFish.Error("not enough chips");
    if (this.bets.some((bet) => bet.user === user && bet.category === category))
      return new CFish.Error("already bet that category this hand");

    this.chips[user] -= amount; // held until the bet resolves or is refunded
    this.bets.push({ user, category, pick, amount });
  }

  private actualOutcomeFor(category: CFish.BetCategory): number {
    const seated = this.seats.filter((seat) => this.userOf[seat] !== null);
    switch (category) {
      case CFish.BetCategory.WINNER:
        return this.winner as number;
      case CFish.BetCategory.MOST_SNIPES:
        return seated.reduce((best, seat) =>
          this.stats[seat].cardsWon > this.stats[best].cardsWon ? seat : best
        );
      case CFish.BetCategory.MOST_STOLEN:
        return seated.reduce((best, seat) =>
          this.stats[seat].cardsLost > this.stats[best].cardsLost ? seat : best
        );
    }
  }

  // pari-mutuel: correct bettors split the whole category's pool (their
  // own stake plus every wrong bettor's) proportional to their stake; if
  // no one guessed right, everyone just gets their stake back. zero-sum
  // among the bettors -- there's no house edge
  private settleBets(): void {
    const results: CFish.BetResult[] = [];

    for (const category of [
      CFish.BetCategory.WINNER,
      CFish.BetCategory.MOST_SNIPES,
      CFish.BetCategory.MOST_STOLEN,
    ]) {
      const inCategory = this.bets.filter((bet) => bet.category === category);
      if (inCategory.length === 0) continue;

      const actual = this.actualOutcomeFor(category);
      const pool = inCategory.reduce((sum, bet) => sum + bet.amount, 0);
      const correctPool = inCategory
        .filter((bet) => bet.pick === actual)
        .reduce((sum, bet) => sum + bet.amount, 0);

      for (const bet of inCategory) {
        const correct = bet.pick === actual;
        const payout =
          correctPool === 0
            ? bet.amount // no one guessed right -- refund the stake
            : correct
            ? Math.round((bet.amount / correctPool) * pool)
            : 0;
        this.chips[bet.user] = (this.chips[bet.user] ?? 0) + payout;
        results.push({ ...bet, correct, payout });
      }
    }

    this.lastBetResults = results;
    this.bets = [];
  }

  // PASS -> ASK
  pass(passer: SeatID, next: SeatID): CFish.Result {
    if (this.phase !== CFish.Phase.PASS) return new CFish.Error("bad phase");
    if (this.asker !== passer) return new CFish.Error("not passer");
    if (this.handSize[passer] !== 0) return new CFish.Error("non-empty hand");
    if (this.teamOf(passer) !== this.teamOf(next))
      return new CFish.Error("different teams");

    this.asker = next;
    this.phase = CFish.Phase.ASK;
    this.tickTimer();
  }

  // any phase -> WAIT
  // admin escape hatch: abort the current hand and return to the lobby.
  // chip balances and seating are untouched; only in-progress hand state
  // (hands, scoring, turn) is cleared
  adminReset(user: UserID): CFish.Result {
    if (this.host !== user) return new CFish.Error("not host");

    this.phase = CFish.Phase.WAIT;
    this.declarerOf = {} as any;
    for (const seat of this.seats) {
      this.handOf[seat] = null;
      this.handSize[seat] = 0;
    }
    this.asker = null;
    this.askee = null;
    this.askedCard = null;
    this.declarer = null;
    this.declaredSuit = null;
    this.declareBonus = {} as any;
    this.chooser = null;
    this.lastResponse = null;
    this.stats = {} as any;

    this.activeTimerSeat = null;
    this.activeSince = null;
    this.usedMs = {} as any;

    // the hand's being aborted, not resolved -- refund pending bets rather
    // than settling them against an outcome that never actually happened
    for (const bet of this.bets) {
      this.chips[bet.user] = (this.chips[bet.user] ?? 0) + bet.amount;
    }
    this.bets = [];
  }

  // debug

  toString(): string {
    let res = "[seats]\n";
    for (const user of this.users) {
      res += ` ${user} seated in ${this.seatOf(user)}\n`;
    }
    res += "[declarations]\n";
    for (let team = 0; team <= 1; team++) {
      res += ` ${team}: (${this.scoreOf(team)}) `;
      for (const suit in Card.FISH_SUITS) {
        if (this.declarerOf[suit] === team) {
          res += `${FishSuit[suit]} `;
        }
      }
      res += `\n`;
    }
    res += `[phase: ${CFish.Phase[this.phase]}]\n `;
    if (this.phase === CFish.Phase.DECLARE) {
      res += `${this.declarer} declaring ${FishSuit[this.declaredSuit]}\n`;
    } else if (this.phase === CFish.Phase.ANSWER) {
      res += `${this.asker} asking ${this.askee} for ${this.askedCard}\n`;
    } else if (this.phase === CFish.Phase.ASK) {
      res += `${this.asker} asking\n`;
    } else if (this.phase === CFish.Phase.CHOOSE) {
      res += `${this.chooser} choosing next asker\n`;
    }
    res += "[hands]\n";
    for (const seat of this.seats) {
      res += ` ${seat}: ${this.handOf[seat] ?? this.handSize[seat]}\n`;
    }
    return res;
  }
}
