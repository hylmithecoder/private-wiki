"use client";

import * as stylex from "@stylexjs/stylex";
import { ArrowLeft, Hash } from "@phosphor-icons/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

import { list } from "@/components/ListStyles";
import { EmptyState, ErrorState, LinkButton, PageHeader, Skeleton, Tag, surface } from "@/components/ui";
import { keys, type PageSummary, type TagCount } from "@/lib/api";
import { ago } from "@/lib/time";
import { useTitle } from "@/lib/useTitle";
import { pageHref } from "@/lib/wiki";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  cloud: { display: "flex", flexWrap: "wrap", gap: 8, padding: { default: 16, [media.md]: 24 } },
  skel: { display: "flex", flexDirection: "column", gap: 10, padding: 16 },
});

export function TagsView() {
  const tag = useSearchParams().get("t");
  useTitle(tag ? `#${tag}` : "Tags");
  return tag ? <TagPages tag={tag} /> : <AllTags />;
}

function AllTags() {
  const { data, error, mutate } = useSWR<TagCount[]>(keys.tags());
  return (
    <>
      <PageHeader title="Tags" sub={data ? `${data.length} ${data.length === 1 ? "tag" : "tags"}` : undefined} />
      {error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : !data ? (
        <div {...stylex.props(surface.paper, s.skel)}>
          <Skeleton width="60%" height={24} />
        </div>
      ) : data.length === 0 ? (
        <div {...stylex.props(surface.paper, list.state)}>
          <EmptyState icon={<Hash size={30} />} title="No tags yet">
            Add tags when editing a page to group related pages.
          </EmptyState>
        </div>
      ) : (
        <div {...stylex.props(surface.paper, s.cloud)}>
          {data.map((t) => (
            <Tag key={t.tag} tag={t.tag} count={t.count} />
          ))}
        </div>
      )}
    </>
  );
}

function TagPages({ tag }: { tag: string }) {
  const { data, error, mutate } = useSWR<PageSummary[]>(keys.pages(tag));
  return (
    <>
      <PageHeader
        title={`#${tag}`}
        sub={data ? `${data.length} ${data.length === 1 ? "page" : "pages"}` : undefined}
        actions={
          <LinkButton href="/tags" variant="ghost">
            <ArrowLeft />
            All tags
          </LinkButton>
        }
      />
      {error ? (
        <ErrorState error={error} retry={() => mutate()} />
      ) : !data ? (
        <div {...stylex.props(surface.paper, s.skel)}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="55%" height={14} />
        </div>
      ) : data.length === 0 ? (
        <div {...stylex.props(surface.paper, list.state)}>
          <EmptyState title="No pages with this tag" />
        </div>
      ) : (
        <div {...stylex.props(surface.paper, list.panel)}>
          {data.map((p) => (
            <Link key={p.slug} href={pageHref(p.slug)} {...stylex.props(list.row)}>
              <span {...stylex.props(list.top)}>
                <span {...stylex.props(list.title)}>{p.title}</span>
                <span {...stylex.props(list.time)}>{ago(p.updated_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
