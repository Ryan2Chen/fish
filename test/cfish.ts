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
      bluff: CFish.BluffRule.YES,
      declare: CFish.DeclareRule.DURING_TURN,
      handSize: CFish.HandSizeRule.PUBLIC,
    });
    engine.startGame("a", false);
    engine.asker = 0; // first asker is now random; pin it for this fixed script
    engine.ask(0, 1, C.C_2);
    engine.answer(1, false);
    engine
      .initDeclare(3, FishSuit.HIGH_CLUBS)
      .should.be.instanceOf(CFish.Error);
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
