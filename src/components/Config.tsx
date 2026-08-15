import React from "react";

import { CFish as C } from "lib/cfish";
import { Client } from "lib/client";

export namespace Config {
  export type Props = {
    client: Client;
  };

  export type State = {
    open: boolean;
  };
}

export class Config extends React.Component<Config.Props, Config.State> {
  constructor(props) {
    super(props);
    this.state = { open: false };
  }

  renderRow<K extends keyof C.Rules>(
    label: string,
    key: K,
    options: { value: C.Rules[K]; label: string }[]
  ) {
    const { client } = this.props;
    const { engine } = client;

    const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const opt = options.find((o) => String(o.value) === e.target.value);
      if (!opt) return;
      client.setRules({ ...engine.rules, [key]: opt.value });
    };

    return (
      <div className="configRow">
        <label className="configLabel">{label}</label>
        <select value={String(engine.rules[key])} onChange={onChange}>
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  renderTimerRows() {
    const { client } = this.props;
    const { engine } = client;
    const { rules } = engine;
    const setRule = (key, value) => client.setRules({ ...rules, [key]: value });

    return (
      <>
        <div className="configRow">
          <label className="configLabel">team timer</label>
          <select
            value={String(rules.timerEnabled)}
            onChange={(e) => setRule("timerEnabled", e.target.value === "true")}
          >
            <option value="false">off</option>
            <option value="true">on</option>
          </select>
        </div>
        {rules.timerEnabled ? (
          <div className="configRow configSubRow">
            <label className="configLabel">budget (min)</label>
            <input
              type="number"
              min={1}
              value={Math.round(rules.timerBudgetMs / 60000)}
              onChange={(e) => setRule("timerBudgetMs", Number(e.target.value) * 60000)}
            />
            <label className="configLabel">+sec / ask</label>
            <input
              type="number"
              min={0}
              value={Math.round(rules.timerIncrementMs / 1000)}
              onChange={(e) => setRule("timerIncrementMs", Number(e.target.value) * 1000)}
            />
          </div>
        ) : null}
      </>
    );
  }

  render() {
    const { client } = this.props;
    const { engine } = client;
    const isHost = engine.identity === engine.host;

    // settings are host-only: not just non-interactive for everyone else,
    // the gear button and the whole panel don't render for them at all
    if (!isHost) return null;

    return (
      <>
        <button
          className="configGear"
          onClick={() => this.setState({ open: true })}
          title="game settings"
        >
          <svg viewBox="0 0 40 40" width="18" height="18">
            <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="20" cy="20" r="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <rect
                key={deg}
                x="18.3"
                y="2.5"
                width="3.4"
                height="6.5"
                rx="1"
                fill="currentColor"
                transform={`rotate(${deg} 20 20)`}
              />
            ))}
          </svg>
        </button>
        {this.state.open ? (
          <div
            className="configModalOverlay"
            onClick={() => this.setState({ open: false })}
          >
            <div className="configModal" onClick={(e) => e.stopPropagation()}>
              <div className="configModalHeader">
                <span>game settings</span>
                <button
                  className="configModalClose"
                  onClick={() => this.setState({ open: false })}
                  title="close"
                >
                  ×
                </button>
              </div>
              {this.renderRow("hand size", "handSize", [
                { value: C.HandSizeRule.PUBLIC, label: "public" },
                { value: C.HandSizeRule.SECRET, label: "private" },
              ])}
              {this.renderRow("log", "log", [
                { value: C.LogRule.LAST_ACTION, label: "last action" },
                { value: C.LogRule.LAST_TWO, label: "last two" },
                { value: C.LogRule.EVERYTHING, label: "all actions" },
              ])}
              {this.renderTimerRows()}
            </div>
          </div>
        ) : null}
      </>
    );
  }
}
