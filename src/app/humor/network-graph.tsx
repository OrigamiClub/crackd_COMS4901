"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { STYLES, styleInfo } from "@/lib/humor-vocab";

export type NetworkNode = {
  id: string;
  name: string | null;
  profpic: string | null;
  likes: number;
  topStyle: string | null;
};

export type NetworkEdge = {
  a: string;
  b: string;
  shared: number;
  cracks: number[];
};

type SimNode = NetworkNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & NetworkEdge;

// Full size for /humor; compact for the home page sidebar.
const SIZES = {
  full: { width: 640, height: 440, radius: 22, meRadius: 30, label: 13, charge: -260, link: 170 },
  compact: { width: 320, height: 220, radius: 17, meRadius: 23, label: 12, charge: -180, link: 90 },
};

function displayName(node: NetworkNode) {
  return node.name || "Someone";
}

// Force-directed graph of everyone who has liked a crack. Lines join people
// who liked the same cracks (thicker = more in common); each ring is the
// person's favorite humor style. Nodes can be dragged; clicking one shows
// what you have in common. `compact` draws just a small graph (no hover
// text or details, but keeps the style legend) for the home page sidebar,
// sized to fill whatever space its parent gives it.
export default function NetworkGraph({
  nodes,
  edges,
  meId,
  cracks,
  compact = false,
}: {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  meId: string;
  cracks: Record<number, { text: string | null; img_url: string | null }>;
  compact?: boolean;
}) {
  // In compact mode the drawing area matches the box it's given, so the
  // graph fills the sidebar instead of keeping a fixed shape.
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!compact || !el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0) {
        setBox((prev) =>
          prev?.width === width && prev?.height === height ? prev : { width, height }
        );
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);
  const size = useMemo(
    () =>
      compact
        ? {
            ...SIZES.compact,
            ...(box ?? {}),
            // Spread people out more when there's more room.
            link: box ? Math.min(box.width, box.height) * 0.4 : SIZES.compact.link,
          }
        : SIZES.full,
    [compact, box]
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const n: SimNode[] = nodes.map((node) => ({ ...node }));
    const l: SimLink[] = edges.map((edge) => ({
      ...edge,
      source: edge.a,
      target: edge.b,
    }));

    const simulation = forceSimulation(n)
      .force(
        "link",
        forceLink<SimNode, SimLink>(l)
          .id((d) => d.id)
          .distance((d) => size.link * (1 - Math.min(d.shared, 5) * 0.1))
      )
      .force("charge", forceManyBody().strength(size.charge))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .force("collide", forceCollide(size.meRadius + 8));
    simulationRef.current = simulation;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) {
      // Settle the layout up front instead of animating it.
      simulation.stop();
      simulation.tick(300);
    }

    const update = () => {
      for (const node of n) {
        const pad = size.meRadius + size.label;
        node.x = Math.max(pad, Math.min(size.width - pad, node.x ?? 0));
        node.y = Math.max(size.meRadius, Math.min(size.height - pad, node.y ?? 0));
      }
      setSimNodes([...n]);
      setSimLinks([...l]);
    };
    simulation.on("tick", update);
    update();

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, size]);

  // Dragging: pin the node under the pointer and let the rest follow.
  function toSvgPoint(event: React.PointerEvent) {
    const svg = svgRef.current!;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()!.inverse());
  }

  function handlePointerDown(event: React.PointerEvent, node: SimNode) {
    (event.target as Element).setPointerCapture(event.pointerId);
    const { x, y } = toSvgPoint(event);
    node.fx = x;
    node.fy = y;
    simulationRef.current?.alphaTarget(0.3).restart();
  }

  function handlePointerMove(event: React.PointerEvent, node: SimNode) {
    if (node.fx == null) return;
    const { x, y } = toSvgPoint(event);
    node.fx = x;
    node.fy = y;
  }

  function handlePointerUp(node: SimNode) {
    node.fx = null;
    node.fy = null;
    simulationRef.current?.alphaTarget(0);
  }

  if (nodes.length < 2) {
    return (
      <p
        className={`rounded-lg border border-black/10 text-sm ${compact ? "p-3" : "p-6"}`}
      >
        The network needs at least two people with likes. Go like some cracks
        and drag a friend in.
      </p>
    );
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sharedWith = (id: string) =>
    edges.find(
      (e) => (e.a === meId && e.b === id) || (e.b === meId && e.a === id)
    );

  const hoverText = (() => {
    if (!hover) return "Hover over someone to see what you share. Drag to rearrange.";
    const node = byId.get(hover);
    if (!node) return "";
    if (node.id === meId) {
      return `You · ${node.likes} ${node.likes === 1 ? "like" : "likes"}`;
    }
    const edge = sharedWith(node.id);
    const style = styleInfo(node.topStyle)?.label;
    return `${displayName(node)}${style ? ` · mostly ${style}` : ""} · ${
      edge
        ? `you both liked ${edge.shared} ${edge.shared === 1 ? "crack" : "cracks"}`
        : "no likes in common yet"
    }`;
  })();

  const selectedNode = selected ? byId.get(selected) : null;
  const selectedEdge = selected ? sharedWith(selected) : null;
  const stylesShown = STYLES.filter((s) =>
    nodes.some((node) => node.topStyle === s.key)
  );

  return (
    <div
      className={
        compact ? "flex min-h-0 flex-1 flex-col gap-2" : "flex flex-col gap-3"
      }
    >
      <div ref={boxRef} className={compact ? "relative min-h-56 flex-1" : undefined}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
          className={`touch-none rounded-lg bg-white/60 dark:bg-white/5 ${
            compact
              ? "absolute inset-0 h-full w-full border border-black/10 dark:border-white/15"
              : "w-full"
          }`}
          role="img"
          aria-label="Network of users connected by cracks they both liked"
        >
          <defs>
            {simNodes.map((node) => (
              <clipPath key={node.id} id={`clip-${node.id}`}>
                <circle r={node.id === meId ? size.meRadius : size.radius} />
              </clipPath>
            ))}
          </defs>
          {simLinks.map((link) => {
            const source = link.source as SimNode;
            const target = link.target as SimNode;
            const active =
              hover === source.id ||
              hover === target.id ||
              selected === source.id ||
              selected === target.id;
            return (
              <line
                key={`${link.a}-${link.b}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="var(--foreground)"
                strokeOpacity={active ? 0.9 : 0.35}
                strokeWidth={1.5 + Math.min(link.shared, 5) * 1.5}
                strokeLinecap="round"
              />
            );
          })}
          {simNodes.map((node) => {
            const isMe = node.id === meId;
            const r = isMe ? size.meRadius : size.radius;
            const ring = styleInfo(node.topStyle)?.color ?? "#9ca3af";
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                className="cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => handlePointerDown(e, node)}
                onPointerMove={(e) => handlePointerMove(e, node)}
                onPointerUp={() => handlePointerUp(node)}
                onPointerEnter={() => setHover(node.id)}
                onPointerLeave={() => setHover(null)}
                onClick={() => setSelected(node.id === selected ? null : node.id)}
              >
                <title>{isMe ? "You" : displayName(node)}</title>
                {node.profpic ? (
                  <image
                    href={node.profpic}
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    clipPath={`url(#clip-${node.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <>
                    <circle r={r} fill={ring} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={r * 0.9}
                    >
                      {displayName(node)[0].toUpperCase()}
                    </text>
                  </>
                )}
                <circle
                  r={r}
                  fill="none"
                  stroke={ring}
                  strokeWidth={4}
                />
                {isMe && (
                  <circle r={r + 5} fill="none" stroke="var(--title)" strokeWidth={2.5} />
                )}
                <text
                  y={r + size.label + 3}
                  textAnchor="middle"
                  fontSize={size.label}
                  fill="var(--foreground)"
                  className="pointer-events-none select-none"
                >
                  {isMe ? "You" : displayName(node)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {!compact && (
        <p className="min-h-5 text-sm" aria-live="polite">
          {hoverText}
        </p>
      )}

      {stylesShown.length > 0 && (
        <div className={`flex flex-wrap text-xs ${compact ? "gap-x-3 gap-y-1" : "gap-3"}`}>
          <span className="opacity-75">Ring = favorite style:</span>
          {stylesShown.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {!compact && selectedNode && selectedNode.id !== meId && (
        <div className="cascade-in rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
          <p className="font-semibold">
            You and {displayName(selectedNode)}
          </p>
          {selectedEdge ? (
            <>
              <p className="opacity-75">
                Both liked {selectedEdge.shared}{" "}
                {selectedEdge.shared === 1 ? "crack" : "cracks"}
                {selectedEdge.shared > selectedEdge.cracks.length
                  ? ", including:"
                  : ":"}
              </p>
              <div className="mt-2 flex gap-2">
                {selectedEdge.cracks.map((id) => {
                  const crack = cracks[id];
                  return crack?.img_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={id}
                      src={crack.img_url}
                      alt={crack.text ?? ""}
                      title={crack.text ?? ""}
                      className="size-20 rounded object-cover"
                    />
                  ) : null;
                })}
              </div>
            </>
          ) : (
            <p className="opacity-75">No likes in common yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
