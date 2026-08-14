import React from "react";

import { SeatID } from "lib/cfish";
import { Client } from "lib/client";

const SPIN_MS = 3500;
const HOLD_MS = 1000; // total stays under 5s

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
    rotation: number;
    seats: SeatID[];
  };
}

export class SpinWheel extends React.Component<
  SpinWheel.Props,
  SpinWheel.State
> {
  timers: ReturnType<typeof setTimeout>[] = [];

  constructor(props) {
    super(props);

    this.state = { spinning: false, rotation: 0, seats: [] };
  }

  componentDidMount() {
    this.props.client.startGameHook = (asker) => this.spin(asker);
  }

  componentWillUnmount() {
    this.timers.forEach((timer) => clearTimeout(timer));
  }

  spin(asker: SeatID) {
    const { engine } = this.props.client;
    const seats = engine.seats;
    const index = seats.indexOf(asker);
    const sliceAngle = 360 / seats.length;
    const midpoint = (index + 0.5) * sliceAngle;
    // several full spins for flourish, landing so the winning slice's
    // midpoint lines up under the fixed pointer at the top
    const rotation = 4 * 360 - midpoint;

    this.setState({ spinning: true, rotation, seats });

    this.timers.push(
      setTimeout(
        () => this.setState({ spinning: false, rotation: 0 }),
        SPIN_MS + HOLD_MS
      )
    );
  }

  render() {
    const { client } = this.props;
    const { spinning, rotation, seats } = this.state;

    if (!spinning) return null;

    const sliceAngle = 360 / seats.length;
    const cx = 100;
    const cy = 100;
    const r = 90;

    return (
      <div className="spinWheel">
        <div className="wheelPointer" />
        <svg
          className="wheelDial"
          viewBox="0 0 200 200"
          style={{
            transition: `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.3, 1)`,
            transform: `rotate(${rotation}deg)`,
          }}
        >
          {seats.map((seat, i) => {
            const start = i * sliceAngle;
            const end = (i + 1) * sliceAngle;
            const mid = start + sliceAngle / 2;
            const labelPos = polar(cx, cy, r * 0.65, mid);

            return (
              <g key={seat}>
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
      </div>
    );
  }
}
