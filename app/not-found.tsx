import Link from "next/link";
import { Empty } from "@/components/empty";

export default function NotFound() {
  return (
    <>
      <header className="page-head">
        <h1>Page not found</h1>
      </header>
      <Empty title="There is nothing at this address">
        The <Link href="/">registry</Link> lists every provider on record.
      </Empty>
    </>
  );
}
