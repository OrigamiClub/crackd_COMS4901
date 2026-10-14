"use client";

import { useEffect, useRef, useState } from "react";
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

const WIDTH = 640;
const HEIGHT = 440;
const RADIUS = 22;
const ME_RADIUS = 30;

function displayName(node: NetworkNode) {
  return node.name || "Someone";
}

// Force-directed graph of everyone who has liked a crack. Lines join people
// who liked the same cracks (thicker = more in common); each ring is the
// person's favorite humor style. Nodes can be dragged; clicking one shows
// what you have in common.
export default function NetworkGraph({
  nodes,
  edges,
  meId,
  cracks,
}: {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  meId: string;
  cracks: Record<number, { text: string | null; img_url: string | null }>;
}) {
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
          .distance((d) => 170 - Math.min(d.shared, 5) * 18)
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", forceCollide(ME_RADIUS + 8));
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
        node.x = Math.max(ME_RADIUS, Math.min(WIDTH - ME_RADIUS, node.x ?? 0));
        node.y = Math.max(ME_RADIUS, Math.min(HEIGHT - ME_RADIUS, node.y ?? 0));
      }
      setSimNodes([...n]);
      setSimLinks([...l]);
    };
    simulation.on("tick", update);
    update();

    return () => {
      simulation.stop();
    };
  }, [nodes, edges]);

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
      <p className="rounded-lg border border-black/10 p-6 text-sm">
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
    <div className="flex flex-col gap-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none rounded-lg border border-black/10 bg-white/60 dark:border-white/15"
        role="img"
        aria-label="Network of users connected by cracks they both liked"
      >
        <defs>
          {simNodes.map((node) => (
            <clipPath key={node.id} id={`clip-${node.id}`}>
              <circle r={node.id === meId ? ME_RADIUS : RADIUS} />
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
          const r = isMe ? ME_RADIUS : RADIUS;
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
                y={r + 16}
                textAnchor="middle"
                fontSize={13}
                fill="var(--foreground)"
                className="pointer-events-none select-none"
              >
                {isMe ? "You" : displayName(node)}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="min-h-5 text-sm" aria-live="polite">
        {hoverText}
      </p>

      {stylesShown.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
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

      {selectedNode && selectedNode.id !== meId && (
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
