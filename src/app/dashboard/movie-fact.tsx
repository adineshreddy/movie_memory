import Markdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { getMovieFact } from "@/server/movie-facts";

export async function MovieFact({ userId }: { userId: string }) {
  const fact = await getMovieFact(userId);

  if (!fact) {
    return <p className="text-zinc-300">We couldn’t load a movie fact right now. Please try again.</p>;
  }

  return (
    <>
      {fact.source === "DEMO" && (
        <p className="mb-2 text-sm font-medium text-amber-300">Demo fact</p>
      )}
      <div className="fact-markdown text-lg leading-relaxed text-zinc-200">
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { trust: false, maxExpand: 100, maxSize: 10 }]]}
          components={{ img: ({ alt }) => alt || null }}
        >
          {fact.text}
        </Markdown>
      </div>
    </>
  );
}
