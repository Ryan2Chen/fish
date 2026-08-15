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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19.14,12.94c0.04,-0.3,0.06,-0.61,0.06,-0.94c0,-0.32,-0.02,-0.64,-0.07,-0.94l2.03,-1.58c0.18,-0.14,0.23,-0.41,0.12,-0.61l-1.92,-3.32c-0.12,-0.22,-0.37,-0.29,-0.59,-0.22l-2.39,0.96c-0.5,-0.38,-1.03,-0.7,-1.62,-0.94L14.4,2.81c-0.04,-0.24,-0.24,-0.41,-0.48,-0.41h-3.84c-0.24,0,-0.43,0.17,-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22,-0.08,-0.47,0,-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14,-0.23,0.41,-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39,-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44,-0.17,0.47,-0.41l0.36,-2.54c0.59,-0.24,1.13,-0.56,1.62,-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59,-0.22l1.92,-3.32c0.12,-0.22,0.07,-0.47,-0.12,-0.61L19.14,12.94z M12,15.6c-1.98,0,-3.6,-1.62,-3.6,-3.6s1.62,-3.6,3.6,-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
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
