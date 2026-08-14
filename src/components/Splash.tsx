import React from "react";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";

type RoomListing = {
  id: string;
  numSeated: number;
  numPlayers: number;
};

const randomCode = (): string =>
  Math.random().toString(36).slice(2, 7).toUpperCase();

export namespace Splash {
  export type Props = RouteComponentProps;

  export type State = {
    room: string;
    rooms: RoomListing[];
  };
}

class Splash extends React.Component<Splash.Props, Splash.State> {
  poll: ReturnType<typeof setInterval> | null = null;

  constructor(props) {
    super(props);

    this.state = {
      room: "",
      rooms: [],
    };
  }

  componentDidMount() {
    this.fetchRooms();
    this.poll = setInterval(() => this.fetchRooms(), 3000);
  }

  componentWillUnmount() {
    if (this.poll !== null) clearInterval(this.poll);
  }

  async fetchRooms() {
    try {
      const res = await fetch("/api/rooms");
      const rooms = await res.json();
      this.setState({ rooms });
    } catch (e) {
      // the lobby list is a nice-to-have; ignore transient fetch failures
    }
  }

  join(room: string) {
    this.props.history.push(`/room/${room}`);
  }

  submit(e) {
    e.preventDefault();
    e.stopPropagation();
    if (this.state.room === "") return;
    this.join(this.state.room);
  }

  handleChangeRoom(e) {
    this.setState({ room: e.target.value });
  }

  renderRoom(room: RoomListing) {
    const full = room.numSeated >= room.numPlayers;

    return (
      <li key={room.id}>
        <span className="roomName">{room.id}</span>
        <span className="roomCount">
          {room.numSeated}/{room.numPlayers}
        </span>
        <button disabled={full} onClick={(e) => this.join(room.id)}>
          {full ? "full" : "join"}
        </button>
      </li>
    );
  }

  render() {
    const { rooms } = this.state;

    return (
      <div className="splash">
        <p>
          <b>cfish</b> ·{" "}
          <a href="https://www.pagat.com/quartet/literature.html">rules</a>
        </p>
        <div className="roomList">
          <p>games looking for players:</p>
          {rooms.length === 0 ? (
            <p className="empty">no open games right now &mdash; start one!</p>
          ) : (
            <ul>{rooms.map((room) => this.renderRoom(room))}</ul>
          )}
        </div>
        <button onClick={(e) => this.join(randomCode())}>
          create a new game
        </button>
        <form onSubmit={(e) => this.submit(e)}>
          <span>
            <label htmlFor="room">or join by code:</label>
            <input
              id="room"
              onChange={(e) => this.handleChangeRoom(e)}
              type="text"
              value={this.state.room}
            />
          </span>
          <button type="submit">go!</button>
        </form>
        <p>by ryrychendog</p>
      </div>
    );
  }
}

export default withRouter(Splash);
