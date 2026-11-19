"use client";

import { useSyncExternalStore } from "react";
import AirlineGame from "./airline/AirlineGame";
import Game from "./Game";
import { modeStore } from "./mode";

/** Picks which game to show: the airport builder or Airline CEO. */
export default function Root() {
  const mode = useSyncExternalStore(modeStore.subscribe, modeStore.get, modeStore.server);
  if (mode === null) return <div className="h-full bg-slate-950" />;
  return mode === "airline" ? <AirlineGame /> : <Game />;
}
