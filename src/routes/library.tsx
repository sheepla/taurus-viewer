import { createFileRoute } from "@tanstack/react-router";
import { LibraryView } from "../features/library";

export const Route = createFileRoute("/library")({
  component: LibraryView,
});
