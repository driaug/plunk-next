import {
  Background,
  Controls,
  type Edge,
  type Node,
  Panel,
  ReactFlow,
  MarkerType,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {WorkflowStep} from '@repo/db';
import {Clock, GitBranch, LogOut, Mail, UserCog, Webhook} from 'lucide-react';
import {useEffect, useMemo} from 'react';
import dagre from 'dagre';

interface WorkflowVisualizerProps {
  steps: (WorkflowStep & {
    template?: {id: string; name: string} | null;
    outgoingTransitions: Array<{
      id: string;
      toStepId: string;
      condition: any;
      priority: number;
    }>;
    incomingTransitions: Array<{
      id: string;
      fromStepId: string;
      condition: any;
      priority: number;
    }>;
  })[];
}

const STEP_TYPE_ICONS = {
  TRIGGER: GitBranch,
  SEND_EMAIL: Mail,
  DELAY: Clock,
  WAIT_FOR_EVENT: Clock,
  CONDITION: GitBranch,
  EXIT: LogOut,
  WEBHOOK: Webhook,
  UPDATE_CONTACT: UserCog,
};

const STEP_TYPE_COLORS = {
  TRIGGER: '#9333ea', // purple-600
  SEND_EMAIL: '#2563eb', // blue-600
  DELAY: '#ea580c', // orange-600
  WAIT_FOR_EVENT: '#ca8a04', // yellow-600
  CONDITION: '#9333ea', // purple-600
  EXIT: '#dc2626', // red-600
  WEBHOOK: '#16a34a', // green-600
  UPDATE_CONTACT: '#4f46e5', // indigo-600
};

const STEP_TYPE_BG = {
  TRIGGER: '#f3e8ff', // purple-50
  SEND_EMAIL: '#dbeafe', // blue-50
  DELAY: '#ffedd5', // orange-50
  WAIT_FOR_EVENT: '#fef3c7', // yellow-50
  CONDITION: '#f3e8ff', // purple-50
  EXIT: '#fee2e2', // red-50
  WEBHOOK: '#dcfce7', // green-50
  UPDATE_CONTACT: '#e0e7ff', // indigo-50
};

// Dagre layout function
function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 250;
  const nodeHeight = 100;

  dagreGraph.setGraph({
    rankdir: 'TB', // Top to Bottom
    nodesep: 80, // Horizontal spacing
    ranksep: 120, // Vertical spacing
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, {width: nodeWidth, height: nodeHeight});
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return {nodes: layoutedNodes, edges};
}

// Custom node component
function CustomNode({data}: {data: any}) {
  const Icon = data.icon;
  const color = data.color;
  const bgColor = data.bgColor;

  return (
    <>
      {/* Target Handle (top) - where edges come IN */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: color,
          width: 12,
          height: 12,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />

      <div
        className="px-5 py-4 rounded-xl border-2 bg-white shadow-lg hover:shadow-xl transition-all cursor-grab active:cursor-grabbing"
        style={{
          borderColor: color,
          minWidth: '250px',
          maxWidth: '250px',
        }}
      >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{backgroundColor: bgColor}}
        >
          <Icon className="h-5 w-5" style={{color}} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-neutral-900 text-sm leading-tight mb-1 break-words">
            {data.label}
          </h4>
          <span
            className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: bgColor,
              color,
            }}
          >
            {data.type}
          </span>
        </div>
      </div>

      {/* Details */}
      {data.template && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium">📧</span>
            <span className="truncate">{data.template.name}</span>
          </div>
        </div>
      )}
      {data.type === 'DELAY' && data.config?.amount && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium">⏱️</span>
            <span>
              Wait {data.config.amount} {data.config.unit}
            </span>
          </div>
        </div>
      )}
      {data.type === 'CONDITION' && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="text-xs text-neutral-600">
            <span className="font-medium">🔀</span> If/Else Branch
          </div>
        </div>
      )}
      {data.type === 'WAIT_FOR_EVENT' && data.config?.eventName && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium">⏳</span>
            <span className="truncate">{data.config.eventName}</span>
          </div>
        </div>
      )}
      {data.type === 'WEBHOOK' && data.config?.url && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span className="font-medium">🔗</span>
            <span className="truncate">{data.config.method || 'POST'}</span>
          </div>
        </div>
      )}
      </div>

      {/* Source Handle (bottom) - where edges go OUT */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: color,
          width: 12,
          height: 12,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />
    </>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

export function WorkflowVisualizer({steps}: WorkflowVisualizerProps) {
  // Convert workflow steps to React Flow nodes
  const rawNodes: Node[] = useMemo(() => {
    if (steps.length === 0) return [];

    const nodes: Node[] = steps.map(step => {
      const Icon = STEP_TYPE_ICONS[step.type as keyof typeof STEP_TYPE_ICONS] || GitBranch;
      const color = STEP_TYPE_COLORS[step.type as keyof typeof STEP_TYPE_COLORS] || '#6b7280';
      const bgColor = STEP_TYPE_BG[step.type as keyof typeof STEP_TYPE_BG] || '#f3f4f6';

      return {
        id: step.id,
        type: 'custom',
        position: {x: 0, y: 0}, // Will be set by layout
        data: {
          label: step.name,
          type: step.type,
          icon: Icon,
          color,
          bgColor,
          template: step.template,
          config: step.config,
        },
      };
    });

    // Add END nodes for CONDITION steps with missing branches
    steps.forEach(step => {
      if (step.type === 'CONDITION') {
        const hasYesBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'yes');
        const hasNoBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'no');

        if (!hasYesBranch) {
          nodes.push({
            id: `${step.id}-yes-end`,
            type: 'custom',
            position: {x: 0, y: 0},
            data: {
              label: 'End Workflow',
              type: 'END',
              icon: LogOut,
              color: '#9ca3af',
              bgColor: '#f3f4f6',
              template: null,
              config: null,
            },
          });
        }

        if (!hasNoBranch) {
          nodes.push({
            id: `${step.id}-no-end`,
            type: 'custom',
            position: {x: 0, y: 0},
            data: {
              label: 'End Workflow',
              type: 'END',
              icon: LogOut,
              color: '#9ca3af',
              bgColor: '#f3f4f6',
              template: null,
              config: null,
            },
          });
        }
      }
    });

    return nodes;
  }, [steps]);

  // Convert transitions to React Flow edges
  const rawEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    steps.forEach(step => {
      // Add edges for existing transitions
      if (step.outgoingTransitions && step.outgoingTransitions.length > 0) {
        step.outgoingTransitions.forEach(transition => {
          const isConditional = transition.condition?.branch;
          const branch = transition.condition?.branch;

          edges.push({
            id: transition.id,
            source: step.id,
            target: transition.toStepId,
            type: 'smoothstep',
            animated: false,
            label: isConditional ? (branch === 'yes' ? '✓ Yes' : '✗ No') : undefined,
            labelStyle: {
              fill: branch === 'yes' ? '#16a34a' : branch === 'no' ? '#dc2626' : '#64748b',
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: '#fff',
              fillOpacity: 0.95,
            },
            labelBgPadding: [8, 4] as [number, number],
            labelBgBorderRadius: 4,
            style: {
              stroke: isConditional ? (branch === 'yes' ? '#16a34a' : '#dc2626') : '#94a3b8',
              strokeWidth: 2,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isConditional ? (branch === 'yes' ? '#16a34a' : '#dc2626') : '#94a3b8',
              width: 20,
              height: 20,
            },
          });
        });
      }

      // Add edges to END nodes for CONDITION steps with missing branches
      if (step.type === 'CONDITION') {
        const hasYesBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'yes');
        const hasNoBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'no');

        if (!hasYesBranch) {
          edges.push({
            id: `${step.id}-yes-end-edge`,
            source: step.id,
            target: `${step.id}-yes-end`,
            type: 'smoothstep',
            animated: false,
            label: '✓ Yes',
            labelStyle: {
              fill: '#16a34a',
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: '#fff',
              fillOpacity: 0.95,
            },
            labelBgPadding: [8, 4] as [number, number],
            labelBgBorderRadius: 4,
            style: {
              stroke: '#16a34a',
              strokeWidth: 2,
              strokeDasharray: '5,5',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#16a34a',
              width: 20,
              height: 20,
            },
          });
        }

        if (!hasNoBranch) {
          edges.push({
            id: `${step.id}-no-end-edge`,
            source: step.id,
            target: `${step.id}-no-end`,
            type: 'smoothstep',
            animated: false,
            label: '✗ No',
            labelStyle: {
              fill: '#dc2626',
              fontWeight: 600,
              fontSize: 12,
            },
            labelBgStyle: {
              fill: '#fff',
              fillOpacity: 0.95,
            },
            labelBgPadding: [8, 4] as [number, number],
            labelBgBorderRadius: 4,
            style: {
              stroke: '#dc2626',
              strokeWidth: 2,
              strokeDasharray: '5,5',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#dc2626',
              width: 20,
              height: 20,
            },
          });
        }
      }
    });

    return edges;
  }, [steps]);

  // Apply dagre layout
  const {nodes: layoutedNodes, edges: layoutedEdges} = useMemo(() => {
    if (rawNodes.length === 0) return {nodes: [], edges: []};
    return getLayoutedElements(rawNodes, rawEdges);
  }, [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes/edges when layout changes
  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  useEffect(() => {
    setEdges(layoutedEdges);
  }, [layoutedEdges, setEdges]);

  if (steps.length === 0) {
    return (
      <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
        <GitBranch className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
        <p className="text-neutral-600 font-medium">No workflow steps yet</p>
        <p className="text-sm text-neutral-500 mt-2">Add steps to your workflow to see the visualization</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[700px] bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-lg border border-neutral-200 shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.3,
          minZoom: 0.5,
          maxZoom: 1.2,
        }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
        proOptions={{hideAttribution: true}}
      >
        <Background color="#e5e7eb" gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-lg shadow-lg"
        />
        <Panel position="top-left" className="bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-lg shadow-lg border border-neutral-200">
          <div className="flex items-center gap-3">
            <GitBranch className="h-4 w-4 text-neutral-700" />
            <div className="text-sm">
              <span className="font-semibold text-neutral-900">{steps.length}</span>
              <span className="text-neutral-600"> step{steps.length !== 1 ? 's' : ''}</span>
              <span className="text-neutral-400 mx-2">·</span>
              <span className="font-semibold text-neutral-900">{rawEdges.length}</span>
              <span className="text-neutral-600"> transition{rawEdges.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </Panel>
        {rawEdges.length === 0 && steps.length > 1 && (
          <Panel position="bottom-center" className="bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-lg shadow-lg">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <span>⚠️</span>
              <span>No transitions found. Connect your steps to see the flow.</span>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
