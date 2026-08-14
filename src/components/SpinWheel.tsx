import React from "react";

import { SeatID } from "lib/cfish";
import { Client } from "lib/client";

const SPIN_MS = 3200;
const HOLD_MS = 1400; // total stays under 5s

const polar = (
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const wedgePath = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
};

export namespace SpinWheel {
  export type Props = {
    client: Client;
  };

  export type State = {
    spinning: boolean;
    landed: boolean;
    rotation: number;
    seats: SeatID[];
    asker: SeatID | null;
  };
}

export class SpinWheel extends React.Component<
  SpinWheel.Props,
  SpinWheel.State
> {
  timers: ReturnType<typeof setTimeout>[] = [];
  frames: number[] = [];

  constructor(props) {
    super(props);

    this.state = {
      spinning: false,
      landed: false,
      rotation: 0,
      seats: [],
      asker: null,
    };
  }

  componentDidMount() {
    this.props.client.startGameHook = (asker) => this.spin(asker);
  }

  componentWillUnmount() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.frames.forEach((frame) => cancelAnimationFrame(frame));
  }

  spin(asker: SeatID) {
    // a re-spin (e.g. admin reset -> start again) can land while a
    // previous spin's timers/frames are still pending; without clearing
    // them first, their stale callbacks fire mid-animation and corrupt it
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers = [];
    this.frames.forEach((frame) => cancelAnimationFrame(frame));
    this.frames = [];

    const { engine } = this.props.client;
    const seats = engine.seats;
    const index = seats.indexOf(asker);
    const sliceAngle = 360 / seats.length;
    const midpoint = (index + 0.5) * sliceAngle;
    // several full spins for flourish, landing so the winning slice's
    // midpoint lines up under the fixed pointer at the top
    const target = 5 * 360 - midpoint;

    // mount at rest first (rotation 0, no CSS transition yet) -- a CSS
    // transition can't animate a value an element is *born* with, only a
    // change to an already-painted element, so the target rotation has to
    // land on a later frame once the browser has actually painted rest
    this.setState({
      spinning: true,
      landed: false,
      rotation: 0,
      seats,
      asker,
    });

    this.frames.push(
      requestAnimationFrame(() => {
        this.frames.push(
          requestAnimationFrame(() => {
            this.setState({ rotation: target });
          })
        );
      })
    );

    this.timers.push(
      setTimeout(() => this.setState({ landed: true }), SPIN_MS)
    );

    this.timers.push(
      setTimeout(() => {
        this.setState({ spinning: false, landed: false, rotation: 0 });
        this.props.client.revealingFirstAsker = false;
        this.props.client.onUpdate?.(this.props.client);
      }, SPIN_MS + HOLD_MS)
    );
  }

  render() {
    const { client } = this.props;
    const { spinning, landed, rotation, seats, asker } = this.state;

    if (!spinning) return null;

    const sliceAngle = 360 / seats.length;
    const cx = 100;
    const cy = 100;
    const r = 90;

    return (
      <div className={`spinWheel ${landed ? "landed" : ""}`}>
        <div className="wheelPointer" />
        <svg
          className="wheelDial"
          viewBox="0 0 200 200"
          style={{
            transition: `transform ${SPIN_MS}ms cubic-bezier(0.1, 0.85, 0.25, 1)`,
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {seats.map((seat, i) => {
            const start = i * sliceAngle;
            const end = (i + 1) * sliceAngle;
            const mid = start + sliceAngle / 2;
            const labelPos = polar(cx, cy, r * 0.65, mid);
            const isWinner = landed && seat === asker;

            return (
              <g key={seat} className={isWinner ? "wheelWinner" : ""}>
                <path
                  d={wedgePath(cx, cy, r, start, end)}
                  className={`wheelSlice team-${client.engine.teamOf(seat)}`}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  className="wheelLabel"
                  transform={`rotate(${mid}, ${labelPos.x}, ${labelPos.y})`}
                >
                  {client.nameOf(seat).slice(0, 8)}
                </text>
              </g>
            );
          })}
        </svg>
        {landed ? (
          <div className="wheelReveal">{client.nameOf(asker)} goes first!</div>
        ) : null}
      </div>
    );
  }
}
