import { should } from "chai";
import "chai/register-should";

import * as C from "./common";
import { FishSuit, Hand, genFishSuit } from "lib/cards";
import { CFish, Engine } from "lib/cfish";

describe("Engine", () => {
  let engine;

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
  });

  it("handles seating", () => {
    engine.addUser("a").should.be.instanceOf(CFish.Error);
    engine.removeUser("g").should.be.instanceOf(CFish.Error);

    engine.addUser("g");
    engine.removeUser("g");
    engine.unseatAt(5);

    engine.users.length.should.equal(6);
    engine.seatAt("f", 0).should.be.instanceOf(CFish.Error);
    engine.seatAt("f", 6).should.be.instanceOf(CFish.Error);
    engine.seatAt("a", 1).should.be.instanceOf(CFish.Error);
    engine.seatAt("g", 5).should.be.instanceOf(CFish.Error);

    engine.seatAt("f", 5);
    engine.removeUser("a");
    engine.removeUser("b");

    engine.users.length.should.equal(4);
    engine.numSeated.should.equal(4);
    engine.host.should.equal("c");
    // engine.seats.should.deep.equal([2, 3, 4, 5, 0, 1]);
    engine.startGame("a").should.be.instanceOf(CFish.Error);

    engine.addUser("a");
    engine.seatAt("a", 0);
    engine.addUser("b");
    engine.seatAt("b", 1);

    engine.startGame("a").should.be.instanceOf(CFish.Error);

    engine.startGame("c");

    engine.startGame("c").should.be.instanceOf(CFish.Error);
  });

  it("runs a basic game", () => {
    engine.startGame("a", false);
    engine.asker = 0; // first asker is now random; pin it for this fixed script

    engine.ask(1, 0, C.C_2).should.be.instanceOf(CFish.Error);
    engine.ask(0, 1, C.C_2).should.be.instanceOf(CFish.Error);
    engine.ask(0, 2, C.C_3).should.be.instanceOf(CFish.Error);
    engine.ask(0, 1, C.C_3);
    engine.answer(1, false).should.be.instanceOf(CFish.Error);
    engine.answer(1, true);
    engine.lastResponse.should.equal("good ask");

    engine.ask(0, 1, C.C_4);
    engine.answer(1, true).should.be.instanceOf(CFish.Error);
    engine.answer(1, false);
    engine.lastResponse.should.equal("bad ask");

    engine.ask(1, 0, C.C_2).should.be.instanceOf(CFish.Error);
    engine.ask(1, 0, C.C_A);
    engine.answer(1, true).should.be.instanceOf(CFish.Error);
    engine.answer(0, true);

    engine.ask(1, 2, C.C_10);
    engine.answer(2, true);
    engine.ask(1, 4, C.C_Q);
    engine
      .initDeclare(3, FishSuit.HIGH_CLUBS)
      .should.be.instanceOf(CFish.Error);
    engine.answer(4, true);

    let owners = {};
    engine.initDeclare(3, FishSuit.HIGH_CLUBS);
    engine.declare(3, owners).should.be.instanceOf(CFish.Error);
    owners[String(C.C_9)] = 1;
    owners[String(C.C_10)] = 1;
    owners[String(C.C_Q)] = 1;
    owners[String(C.C_A)] = 1;
    engine.declare(3, owners).should.be.instanceOf(CFish.Error);
    owners[String(C.C_J)] = 3;
    owners[String(C.C_K)] = 4;
    engine.declare(3, owners).should.be.instanceOf(CFish.Error);
    owners[String(C.C_K)] = 5;
    engine.declare(3, owners);

    engine.lastResponse.should.equal("good declare");
    engine.scoreOf(0).should.equal(0);
    engine.scoreOf(1).should.equal(1);

    // seat 1 (team SECOND) already held the turn when its teammate
    // declared, so the bonus is spent immediately instead of banked
    engine.phase.should.equal(CFish.Phase.CHOOSE);
    engine.chooser.should.equal(3);
    engine.assignTurn(3, 1); // keep the turn with the same asker
    engine.asker.should.equal(1);

    owners = {};
    engine
      .initDeclare(3, FishSuit.HIGH_CLUBS)
      .should.be.instanceOf(CFish.Error);

    const trashDeclare = (declarer, suit, owner) => {
      engine.initDeclare(declarer, suit);
      for (const card of genFishSuit(suit)) {
        owners[String(card)] = owner;
      }
      engine.declare(declarer, owners);
    };
    trashDeclare(3, FishSuit.LOW_CLUBS, 1);

    engine.lastResponse.should.equal("bad declare");
    engine.scoreOf(0).should.equal(1);
    engine.scoreOf(1).should.equal(1);

    trashDeclare(0, FishSuit.LOW_DIAMONDS, 0);
    trashDeclare(1, FishSuit.HIGH_DIAMONDS, 1);
    trashDeclare(0, FishSuit.LOW_SPADES, 0);
    trashDeclare(1, FishSuit.HIGH_SPADES, 1);
    trashDeclare(0, FishSuit.LOW_HEARTS, 0);
    trashDeclare(1, FishSuit.HIGH_HEARTS, 1);

    engine.scoreOf(0).should.equal(4);
    engine.scoreOf(1).should.equal(4);

    trashDeclare(0, FishSuit.EIGHTS, 0);

    engine.phase.should.equal(CFish.Phase.WAIT);
  });

  it("handles rules", () => {
    engine.setRules("a", {
      numPlayers: 6,
      handSize: CFish.HandSizeRule.PUBLIC,
    });
    engine.startGame("a", false);
    engine.asker = 0; // first asker is now random; pin it for this fixed script
    engine.ask(0, 1, C.C_2);
    engine.answer(1, false);
    // declaring is allowed any time, not just on your own turn
    (engine.initDeclare(3, FishSuit.HIGH_CLUBS) === undefined).should.equal(
      true
    );
  });

  it("runs with people added/removed", () => {
    engine.addUser("g");
    engine.unseatAt(5);
  });
});

describe("Engine declare bonus / choose phase", () => {
  // seats 0,2,4 are Team.FIRST; seats 1,3,5 are Team.SECOND
  let engine;

  const setHand = (seat, cards) => {
    engine.handOf[seat] = new Hand(cards);
    engine.handSize[seat] = cards.length;
  };

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
    engine.startGame("a", false);
    engine.asker = 0; // first asker is now random; pin it for this fixed script

    // team SECOND fully owns LOW_DIAMONDS, plus a spare card each so their
    // hands aren't emptied once the suit is declared and swept away
    setHand(0, [C.C_2, C.S_2]);
    setHand(1, [C.D_2, C.D_3, C.S_3]);
    setHand(2, [C.C_3]);
    setHand(3, [C.D_4, C.D_5, C.S_4]);
    setHand(4, [C.C_4]);
    setHand(5, [C.D_6, C.D_7, C.S_5]);
  });

  const declareLowDiamonds = (declarer) => {
    engine.initDeclare(declarer, FishSuit.LOW_DIAMONDS);
    const owners = {};
    owners[String(C.D_2)] = 1;
    owners[String(C.D_3)] = 1;
    owners[String(C.D_4)] = 3;
    owners[String(C.D_5)] = 3;
    owners[String(C.D_6)] = 5;
    owners[String(C.D_7)] = 5;
    return engine.declare(declarer, owners);
  };

  it("banks a bonus on a successful declare, letting the receiver choose", () => {
    engine.asker.should.equal(0);

    declareLowDiamonds(1).should.equal(true);
    engine.declareBonus[CFish.Team.SECOND].should.equal(true);

    // a bad answer would normally hand the turn straight to seat 3
    engine.ask(0, 3, C.C_5);
    engine.answer(3, false);

    engine.phase.should.equal(CFish.Phase.CHOOSE);
    engine.chooser.should.equal(3);
    engine.asker.should.equal(0); // not yet reassigned
    (engine.declareBonus[CFish.Team.SECOND] === undefined).should.equal(true);

    engine.assignTurn(0, 5).should.be.instanceOf(CFish.Error); // wrong chooser
    engine.assignTurn(3, 0).should.be.instanceOf(CFish.Error); // different team

    engine.assignTurn(3, 5);
    engine.phase.should.equal(CFish.Phase.ASK);
    engine.asker.should.equal(5);
    (engine.chooser === null).should.equal(true);
  });

  it("grants no bonus and does not pend on a failed declare", () => {
    engine.initDeclare(1, FishSuit.LOW_DIAMONDS);
    const owners = {};
    for (const card of genFishSuit(FishSuit.LOW_DIAMONDS)) {
      owners[String(card)] = 1; // wrong: seat 1 doesn't hold all of it
    }
    engine.declare(1, owners).should.equal(false);
    (engine.declareBonus[CFish.Team.SECOND] === undefined).should.equal(true);

    engine.ask(0, 3, C.C_5);
    engine.answer(3, false);

    // no bank to spend, so the turn transfers normally
    engine.phase.should.equal(CFish.Phase.ASK);
    engine.asker.should.equal(3);
  });

  it("spends the bonus immediately when the declaring team already has the turn", () => {
    // flip whose turn it is: now Team FIRST (seat 0) already holds the
    // turn, and a Team FIRST player declares correctly -- there's no
    // future "transfer to them" to wait for, so it should go straight to
    // CHOOSE instead of banking a bonus that would sit unused
    setHand(0, [C.C_5, C.C_6]);
    setHand(2, [C.D_2, C.D_3, C.S_3]);
    setHand(4, [C.D_4, C.D_5, C.S_4, C.D_6, C.D_7, C.S_5]);
    engine.declarerOf = {} as any;

    engine.initDeclare(0, FishSuit.LOW_DIAMONDS);
    const owners = {};
    owners[String(C.D_2)] = 2;
    owners[String(C.D_3)] = 2;
    owners[String(C.D_4)] = 4;
    owners[String(C.D_5)] = 4;
    owners[String(C.D_6)] = 4;
    owners[String(C.D_7)] = 4;
    engine.declare(0, owners).should.equal(true);

    engine.phase.should.equal(CFish.Phase.CHOOSE);
    engine.chooser.should.equal(0);
    engine.asker.should.equal(0); // not reassigned yet
    (engine.declareBonus[CFish.Team.FIRST] === undefined).should.equal(true);

    engine.assignTurn(0, 4);
    engine.phase.should.equal(CFish.Phase.ASK);
    engine.asker.should.equal(4);
    (engine.chooser === null).should.equal(true);
  });

  it("rejects assigning the turn to a card-less teammate", () => {
    declareLowDiamonds(1).should.equal(true);

    engine.ask(0, 3, C.C_5);
    engine.answer(3, false);
    engine.phase.should.equal(CFish.Phase.CHOOSE);

    setHand(5, []); // seat 5 has no cards left
    engine.assignTurn(3, 5).should.be.instanceOf(CFish.Error);
    engine.phase.should.equal(CFish.Phase.CHOOSE); // still pending
  });

  it("backs out of a misclicked declare without scoring either team", () => {
    engine.initDeclare(1, FishSuit.LOW_DIAMONDS); // wrong suit, meant HIGH_DIAMONDS

    engine.cancelDeclare(0).should.be.instanceOf(CFish.Error); // wrong declarer
    engine.phase.should.equal(CFish.Phase.DECLARE); // unaffected by the rejected attempt

    engine.cancelDeclare(1);
    engine.phase.should.equal(CFish.Phase.ASK);
    (engine.declarer === null).should.equal(true);
    (engine.declaredSuit === null).should.equal(true);
    engine.scoreOf(CFish.Team.FIRST).should.equal(0);
    engine.scoreOf(CFish.Team.SECOND).should.equal(0);
    Object.keys(engine.declarerOf).length.should.equal(0);

    // the suit is still open -- a real declare against it still works
    declareLowDiamonds(1).should.equal(true);
  });
});

describe("Engine stats", () => {
  let engine;

  const setHand = (seat, cards) => {
    engine.handOf[seat] = new Hand(cards);
    engine.handSize[seat] = cards.length;
  };

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
    engine.startGame("a", false);
    engine.asker = 0;

    setHand(0, [C.C_2, C.D_2, C.D_3, C.S_3]);
    setHand(1, [C.C_3]);
    setHand(2, [C.D_4, C.D_5, C.S_4]);
    setHand(3, [C.C_4]);
    setHand(4, [C.D_6, C.D_7, C.S_5]);
    setHand(5, [C.C_5]);
  });

  it("starts every seat at zero", () => {
    engine.seats.forEach((seat) => {
      engine.stats[seat].should.deep.equal({
        cardsWon: 0,
        cardsLost: 0,
        declaresCorrect: 0,
        declaresIncorrect: 0,
        asksMade: 0,
      });
    });
  });

  it("credits a successful ask to the asker and debits the askee", () => {
    engine.ask(0, 1, C.C_5); // seat 0 holds low clubs (C_2) but not this card
    engine.answer(1, false); // seat 1 doesn't have it
    engine.stats[0].cardsWon.should.equal(0);
    engine.stats[1].cardsLost.should.equal(0);

    engine.asker = 0;
    engine.phase = CFish.Phase.ASK;
    engine.ask(0, 3, C.C_4); // seat 3 (opposing team) does have it
    engine.answer(3, true);
    engine.stats[0].cardsWon.should.equal(1);
    engine.stats[3].cardsLost.should.equal(1);
  });

  it("credits/debits declare outcomes to the declarer specifically, not the team", () => {
    engine.initDeclare(2, FishSuit.LOW_DIAMONDS);
    const owners = {};
    owners[String(C.D_2)] = 0;
    owners[String(C.D_3)] = 0;
    owners[String(C.D_4)] = 2;
    owners[String(C.D_5)] = 2;
    owners[String(C.D_6)] = 4;
    owners[String(C.D_7)] = 4;
    engine.declare(2, owners).should.equal(true);

    engine.stats[2].declaresCorrect.should.equal(1);
    engine.stats[0].declaresCorrect.should.equal(0); // teammate, not the declarer
    engine.stats[4].declaresCorrect.should.equal(0);

    engine.assignTurn(2, 0); // spend the immediate bonus to get back to ASK

    engine.initDeclare(0, FishSuit.LOW_SPADES);
    const wrongOwners = {};
    for (const card of genFishSuit(FishSuit.LOW_SPADES)) {
      wrongOwners[String(card)] = 0; // definitely wrong, no one holds it all
    }
    engine.declare(0, wrongOwners).should.equal(false);
    engine.stats[0].declaresIncorrect.should.equal(1);
  });

  it("picks the aceSeat and mvpSeat with the best raw/weighted totals", () => {
    engine.ask(0, 1, C.C_3);
    engine.answer(1, true);

    engine.asker = 0;
    engine.phase = CFish.Phase.ASK;
    engine.ask(0, 3, C.C_4);
    engine.answer(3, true);

    engine.aceSeat.should.equal(0); // 2 successful asks, more than anyone
    engine.mvpSeat.should.equal(0);
  });

  it("clears stats on adminReset and reinitializes them on the next startGame", () => {
    engine.ask(0, 1, C.C_3);
    engine.answer(1, true);
    engine.stats[0].cardsWon.should.equal(1);

    engine.adminReset("a"); // doesn't unseat anyone, just clears hand state
    Object.keys(engine.stats).length.should.equal(0);

    engine.startGame("a", false);
    engine.stats[0].should.deep.equal({
      cardsWon: 0,
      cardsLost: 0,
      declaresCorrect: 0,
      declaresIncorrect: 0,
      asksMade: 0,
    });
  });
});

describe("Engine timer", () => {
  let engine;

  const setHand = (seat, cards) => {
    engine.handOf[seat] = new Hand(cards);
    engine.handSize[seat] = cards.length;
  };

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
    engine.startGame("a", false);
    engine.asker = 0;
    setHand(0, [C.C_2, C.D_2]);
    setHand(1, [C.D_3]); // doesn't hold C_3, so a false answer is valid
  });

  it("accumulates usedMs for whichever seat's clock was running", () => {
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;

    try {
      engine.activeTimerSeat = 0;
      engine.activeSince = now; // seat 0's clock has been running since "now"

      now += 4000;
      engine.ask(0, 1, C.C_3);
      engine.usedMs[0].should.equal(4000);
      engine.activeTimerSeat.should.equal(1); // askee is active during ANSWER

      now += 2500;
      engine.answer(1, false); // bad ask, no bonus banked -- turn passes plainly
      engine.usedMs[1].should.equal(2500);
    } finally {
      Date.now = realNow;
    }
  });

  it("computes a team's remaining budget from usedMs and asksMade increments", () => {
    engine.rules.timerBudgetMs = 10000;
    engine.rules.timerIncrementMs = 1000;
    engine.usedMs[0] = 3000;
    engine.usedMs[2] = 1000;
    engine.stats[0].asksMade = 2;

    // team FIRST = seats 0, 2, 4
    engine
      .remainingMsFor(CFish.Team.FIRST)
      .should.equal(10000 + 2 * 1000 - (3000 + 1000));
  });
});

describe("Engine plays past a clinched majority", () => {
  let engine;

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
    engine.startGame("a", false);
    engine.asker = 0;
  });

  // declares owners that don't match reality, so it's always a *wrong*
  // declare -- which awards the point to the opposing team, not owner's
  const trashDeclare = (declarer, suit, owner) => {
    engine.initDeclare(declarer, suit);
    const owners = {};
    for (const card of genFishSuit(suit)) {
      owners[String(card)] = owner;
    }
    engine.declare(declarer, owners);
  };

  it("keeps going after a team clinches 5, only ending once all 9 are declared", () => {
    // seat 1 (team SECOND) wrongly declares 5 suits in a row; each wrong
    // declare awards the point to team FIRST, the opposing team
    trashDeclare(1, FishSuit.HIGH_CLUBS, 1);
    trashDeclare(1, FishSuit.LOW_CLUBS, 1);
    trashDeclare(1, FishSuit.LOW_DIAMONDS, 1);
    trashDeclare(1, FishSuit.HIGH_DIAMONDS, 1);
    trashDeclare(1, FishSuit.LOW_SPADES, 1);

    engine.scoreOf(CFish.Team.FIRST).should.equal(5);
    engine.winner.should.equal(CFish.Team.FIRST); // clinched...
    engine.phase.should.not.equal(CFish.Phase.WAIT); // ...but still playing
    engine.allSuitsDeclared.should.equal(false);

    trashDeclare(1, FishSuit.HIGH_SPADES, 1);
    trashDeclare(1, FishSuit.LOW_HEARTS, 1);
    trashDeclare(1, FishSuit.HIGH_HEARTS, 1);
    trashDeclare(1, FishSuit.EIGHTS, 1);

    engine.allSuitsDeclared.should.equal(true);
    engine.phase.should.equal(CFish.Phase.WAIT);
    engine.scoreOf(CFish.Team.FIRST).should.equal(9);
  });
});

describe("Engine chip settlement", () => {
  let engine;

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules); // buyIn: 10, numPlayers: 6
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
  });

  it("gives the winners a sliver of the pot on a narrow win", () => {
    // team FIRST (0,2,4) wins 5-4
    for (let i = 0; i < 5; i++) {
      engine.declarerOf[i] = CFish.Team.FIRST;
    }
    for (let i = 5; i < 9; i++) {
      engine.declarerOf[i] = CFish.Team.SECOND;
    }
    engine.settleChips(CFish.Team.FIRST);

    // pot = 10 * 6 = 60; margin = 1; payout = round(60/9) = 7; floor(7/3) = 2
    engine.chips["a"].should.equal(102);
    engine.chips["c"].should.equal(102);
    engine.chips["e"].should.equal(102);
    engine.chips["b"].should.equal(98);
    engine.chips["d"].should.equal(98);
    engine.chips["f"].should.equal(98);
  });

  it("gives the winners the whole pot on a 9-0 sweep", () => {
    for (let i = 0; i < 9; i++) {
      engine.declarerOf[i] = CFish.Team.SECOND;
    }
    engine.settleChips(CFish.Team.SECOND);

    // pot = 60; margin = 9; payout = 60; floor(60/3) = 20
    engine.chips["b"].should.equal(120);
    engine.chips["d"].should.equal(120);
    engine.chips["f"].should.equal(120);
    engine.chips["a"].should.equal(80);
    engine.chips["c"].should.equal(80);
    engine.chips["e"].should.equal(80);
  });
});

describe("Engine betting", () => {
  let engine;

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules); // startingChips: 100
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
  });

  it("rejects bets outside the WAIT phase", () => {
    engine.startGame("a", false);
    engine
      .placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 10)
      .should.be.instanceOf(CFish.Error);
  });

  it("rejects a bet bigger than the bettor's chip balance", () => {
    engine
      .placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 1000)
      .should.be.instanceOf(CFish.Error);
  });

  it("rejects a second bet in the same category", () => {
    engine.placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 10);
    engine
      .placeBet("a", CFish.BetCategory.WINNER, CFish.Team.SECOND, 10)
      .should.be.instanceOf(CFish.Error);
  });

  it("holds the stake immediately, before the bet resolves", () => {
    engine.placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 10);
    engine.chips["a"].should.equal(90);
  });

  it("splits a category's pool among correct bettors, proportional to stake", () => {
    engine.placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 10); // correct
    engine.placeBet("c", CFish.BetCategory.WINNER, CFish.Team.FIRST, 30); // correct
    engine.placeBet("b", CFish.BetCategory.WINNER, CFish.Team.SECOND, 20); // wrong

    for (let i = 0; i < 6; i++) engine.declarerOf[i] = CFish.Team.FIRST;
    for (let i = 6; i < 9; i++) engine.declarerOf[i] = CFish.Team.SECOND;
    // team FIRST wins 6-3

    engine.settleBets();

    // pool = 60, correctPool = 40 -- a: round(10/40*60)=15, c: round(30/40*60)=45
    engine.chips["a"].should.equal(100 - 10 + 15);
    engine.chips["c"].should.equal(100 - 30 + 45);
    engine.chips["b"].should.equal(100 - 20);

    engine.lastBetResults.length.should.equal(3);
    engine.bets.length.should.equal(0);
  });

  it("refunds everyone in a category if no one guessed right", () => {
    engine.placeBet("a", CFish.BetCategory.WINNER, CFish.Team.SECOND, 10);
    engine.placeBet("b", CFish.BetCategory.WINNER, CFish.Team.SECOND, 20);

    for (let i = 0; i < 6; i++) engine.declarerOf[i] = CFish.Team.FIRST;
    for (let i = 6; i < 9; i++) engine.declarerOf[i] = CFish.Team.SECOND;

    engine.settleBets();

    engine.chips["a"].should.equal(100);
    engine.chips["b"].should.equal(100);
  });

  it("resolves mostSnipes/mostStolen bets against actual per-seat stats", () => {
    engine.stats = {};
    for (const seat of engine.seats) engine.stats[seat] = CFish.emptySeatStats();
    engine.stats[1].cardsWon = 5;
    engine.stats[3].cardsLost = 4;

    engine.placeBet("a", CFish.BetCategory.MOST_SNIPES, 1, 10);
    engine.placeBet("c", CFish.BetCategory.MOST_STOLEN, 3, 10);
    for (let i = 0; i < 9; i++) engine.declarerOf[i] = CFish.Team.FIRST;

    engine.settleBets();

    // sole bettor in each category and correct -- gets their own stake back
    engine.chips["a"].should.equal(100);
    engine.chips["c"].should.equal(100);
  });

  it("refunds pending bets on adminReset instead of settling them", () => {
    engine.placeBet("a", CFish.BetCategory.WINNER, CFish.Team.FIRST, 15);
    engine.chips["a"].should.equal(85);

    engine.adminReset("a");

    engine.chips["a"].should.equal(100);
    engine.bets.length.should.equal(0);
  });
});

describe("Engine admin reset", () => {
  let engine;

  beforeEach(() => {
    engine = new Engine(CFish.defaultRules);
    ["a", "b", "c", "d", "e", "f"].forEach((user, seat) => {
      engine.addUser(user);
      engine.seatAt(user, seat);
    });
    engine.startGame("a", false);
    engine.asker = 0; // first asker is now random; pin it for this fixed script
  });

  it("rejects reset from a non-host", () => {
    engine.adminReset("b").should.be.instanceOf(CFish.Error);
    engine.phase.should.equal(CFish.Phase.ASK);
  });

  it("lets the host abort the hand and return to the lobby", () => {
    engine.ask(0, 1, C.C_3);
    engine.answer(1, true);

    const chipsBefore = { ...engine.chips };
    engine.adminReset("a");

    engine.phase.should.equal(CFish.Phase.WAIT);
    (engine.asker === null).should.equal(true);
    (engine.handOf[0] === null).should.equal(true);
    engine.handSize[0].should.equal(0);
    Object.keys(engine.declarerOf).length.should.equal(0);
    // chip balances are untouched by a reset
    engine.chips.should.deep.equal(chipsBefore);
  });
});
