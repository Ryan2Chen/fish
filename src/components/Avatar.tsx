import React from "react";

// small set of code-drawn lo-fi critter faces; no external image assets
export const AVATARS = [
  "peach",
  "mint",
  "sky",
  "lilac",
  "butter",
  "blush",
] as const;
export type AvatarID = typeof AVATARS[number];

const AVATAR_COLORS: Record<AvatarID, string> = {
  peach: "#ffb199",
  mint: "#9fe0c0",
  sky: "#a8d4f0",
  lilac: "#c9b6f0",
  butter: "#ffe08a",
  blush: "#f7a8c4",
};

// pointy ears for half the set, round for the rest -- just for a bit of
// visual variety between options, not meant to depict specific animals
const POINTY_EARS: AvatarID[] = ["peach", "sky", "butter"];

export namespace Avatar {
  export type Props = {
    id?: string;
    size?: number;
  };
}

export class Avatar extends React.Component<Avatar.Props> {
  render() {
    const id = (AVATARS.includes(this.props.id as AvatarID)
      ? this.props.id
      : AVATARS[0]) as AvatarID;
    const color = AVATAR_COLORS[id];
    const pointy = POINTY_EARS.includes(id);

    return (
      <svg
        className="avatar"
        viewBox="0 0 40 40"
        width={this.props.size ?? 28}
        height={this.props.size ?? 28}
      >
        {pointy ? (
          <>
            <path d="M 4 14 L 12 2 L 14 12 Z" fill={color} />
            <path d="M 36 14 L 28 2 L 26 12 Z" fill={color} />
          </>
        ) : (
          <>
            <circle cx="8" cy="10" r="7" fill={color} />
            <circle cx="32" cy="10" r="7" fill={color} />
          </>
        )}
        <circle cx="20" cy="22" r="16" fill={color} />
        <circle cx="14" cy="20" r="2" fill="#4a3b5c" />
        <circle cx="26" cy="20" r="2" fill="#4a3b5c" />
        <path
          d="M 15 27 Q 20 31 25 27"
          stroke="#4a3b5c"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
}
