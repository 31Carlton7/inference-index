import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mainFileUrl } from "@/lib/links";

// Renders a method note from docs/ so the page changes in the same commit as the method.
// The note's own top-level title is dropped; the page supplies the heading.
export function MethodDoc({ file, pending }: { file: string; pending: string }) {
  const filePath = path.join(process.cwd(), "docs", file);
  if (!existsSync(filePath)) return <p className="pending">{pending}</p>;
  const body = readFileSync(filePath, "utf8").replace(/^# .*\n/, "");
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: "h3",
        h2: "h3",
        h3: "h4",
        // A note links to its neighbours in docs/ by file name, which only resolves on GitHub.
        a: ({ href, children }) => <a href={href && !/^(https?:|#)/.test(href) ? mainFileUrl(`docs/${href}`) : href}>{children}</a>,
        table: (props) => (
          <div className="table-wrap">
            <table {...props} />
          </div>
        ),
      }}
    >
      {body}
    </Markdown>
  );
}
