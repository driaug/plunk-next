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
  MiniMap,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {Template, WorkflowStep} from '@repo/db';
import {
  Clock,
  GitBranch,
  LogOut,
  Mail,
  UserCog,
  Webhook,
  Plus,
  Trash2,
  Settings,
} from 'lucide-react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import dagre from 'dagre';
import {network} from '../lib/network';
import {toast} from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';

interface WorkflowBuilderProps {
  workflowId: string;
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
  onUpdate: () => void;
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
  TRIGGER: '#9333ea',
  SEND_EMAIL: '#2563eb',
  DELAY: '#ea580c',
  WAIT_FOR_EVENT: '#ca8a04',
  CONDITION: '#9333ea',
  EXIT: '#dc2626',
  WEBHOOK: '#16a34a',
  UPDATE_CONTACT: '#4f46e5',
};

const STEP_TYPE_BG = {
  TRIGGER: '#f3e8ff',
  SEND_EMAIL: '#dbeafe',
  DELAY: '#ffedd5',
  WAIT_FOR_EVENT: '#fef3c7',
  CONDITION: '#f3e8ff',
  EXIT: '#fee2e2',
  WEBHOOK: '#dcfce7',
  UPDATE_CONTACT: '#e0e7ff',
};

// Dagre layout function
function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 280;
  const nodeHeight = 120;

  dagreGraph.setGraph({
    rankdir: 'TB',
    nodesep: 100,
    ranksep: 150,
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

// Add Step Node - appears at the end of flow paths
function AddStepNode({data}: {data: any}) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#94a3b8',
          width: 14,
          height: 14,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />

      <div
        className="cursor-pointer hover:scale-110 transition-transform"
        onClick={data.onClick}
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-neutral-100 to-neutral-200 border-2 border-dashed border-neutral-400 hover:border-neutral-600 hover:from-blue-50 hover:to-blue-100 hover:border-blue-400 flex items-center justify-center shadow-md hover:shadow-lg transition-all">
          <Plus className="h-8 w-8 text-neutral-500 hover:text-blue-600 transition-colors" />
        </div>
        {data.label && (
          <div className="text-xs text-neutral-500 text-center mt-2 font-medium">
            {data.label}
          </div>
        )}
      </div>
    </>
  );
}

// Custom node component with action buttons
function CustomNode({data}: {data: any}) {
  const Icon = data.icon;
  const color = data.color;
  const bgColor = data.bgColor;
  const [showActions, setShowActions] = useState(false);

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: color,
          width: 14,
          height: 14,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />

      <div
        className="px-5 py-4 rounded-xl border-2 bg-white shadow-lg hover:shadow-xl transition-all relative group"
        style={{
          borderColor: color,
          minWidth: '280px',
          maxWidth: '280px',
        }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Action buttons - shown on hover */}
        {showActions && data.type !== 'TRIGGER' && (
          <div className="absolute -top-3 -right-3 flex gap-1.5 z-10">
            <button
              onClick={e => {
                e.stopPropagation();
                data.onEdit?.();
              }}
              className="p-1.5 bg-white border-2 border-neutral-300 rounded-lg shadow-md hover:border-neutral-400 hover:bg-neutral-50 transition-all"
              title="Edit step"
            >
              <Settings className="h-3.5 w-3.5 text-neutral-700" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                data.onDelete?.();
              }}
              className="p-1.5 bg-white border-2 border-red-300 rounded-lg shadow-md hover:border-red-400 hover:bg-red-50 transition-all"
              title="Delete step"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-600" />
            </button>
          </div>
        )}

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
        {data.type === 'CONDITION' && data.config && (
          <div className="mt-3 pt-3 border-t border-neutral-100">
            <div className="text-xs text-neutral-600">
              <div className="flex items-center gap-1 mb-1">
                <span className="font-medium">🔀</span>
                <span className="font-mono text-[10px] truncate">{data.config.field}</span>
              </div>
              <div className="text-[10px] text-neutral-500 ml-4">
                {data.config.operator} "{String(data.config.value)}"
              </div>
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
              <span className="truncate text-[10px]">{data.config.method || 'POST'} {data.config.url}</span>
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: color,
          width: 14,
          height: 14,
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      />
    </>
  );
}

const nodeTypes = {
  custom: CustomNode,
  addStep: AddStepNode,
};

// Step type options for adding new steps
const STEP_TYPE_OPTIONS = [
  {value: 'SEND_EMAIL', label: 'Send Email', icon: Mail, color: STEP_TYPE_COLORS.SEND_EMAIL},
  {value: 'DELAY', label: 'Delay', icon: Clock, color: STEP_TYPE_COLORS.DELAY},
  {value: 'WAIT_FOR_EVENT', label: 'Wait for Event', icon: Clock, color: STEP_TYPE_COLORS.WAIT_FOR_EVENT},
  {value: 'CONDITION', label: 'Condition', icon: GitBranch, color: STEP_TYPE_COLORS.CONDITION},
  {value: 'WEBHOOK', label: 'Webhook', icon: Webhook, color: STEP_TYPE_COLORS.WEBHOOK},
  {value: 'UPDATE_CONTACT', label: 'Update Contact', icon: UserCog, color: STEP_TYPE_COLORS.UPDATE_CONTACT},
  {value: 'EXIT', label: 'Exit', icon: LogOut, color: STEP_TYPE_COLORS.EXIT},
];

export function WorkflowBuilder({workflowId, steps, onUpdate}: WorkflowBuilderProps) {
  const reactFlowInstance = useReactFlow();
  const [addStepContext, setAddStepContext] = useState<{
    fromStepId: string | null;
    branch?: 'yes' | 'no';
  } | null>(null);

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
        position: step.position ? (step.position as {x: number; y: number}) : {x: 0, y: 0},
        data: {
          label: step.name,
          type: step.type,
          icon: Icon,
          color,
          bgColor,
          template: step.template,
          config: step.config,
          onEdit: () => handleEditStep(step.id),
          onDelete: () => handleDeleteStep(step.id),
        },
      };
    });

    // Add "Add Step" nodes at the end of each flow path
    steps.forEach(step => {
      if (step.type === 'EXIT') return; // Exit steps can't have next steps

      if (step.type === 'CONDITION') {
        // Check for yes and no branches
        const hasYesBranch = step.outgoingTransitions?.some(t => {
          const condition = t.condition as any;
          return condition?.branch === 'yes';
        });
        const hasNoBranch = step.outgoingTransitions?.some(t => {
          const condition = t.condition as any;
          return condition?.branch === 'no';
        });

        // Debug logging
        if (step.outgoingTransitions && step.outgoingTransitions.length > 0) {
          console.log(`Step ${step.name} (${step.id}) has ${step.outgoingTransitions.length} transitions:`);
          step.outgoingTransitions.forEach((t, idx) => {
            const condition = t.condition as any;
            console.log(`  [${idx}] id: ${t.id}, to: ${t.toStepId}, condition:`, condition, `branch: ${condition?.branch}`);
          });
          console.log(`  hasYesBranch: ${hasYesBranch}, hasNoBranch: ${hasNoBranch}`);
        }

        if (!hasYesBranch) {
          nodes.push({
            id: `${step.id}-add-yes`,
            type: 'addStep',
            position: {x: 0, y: 0},
            data: {
              label: 'Yes',
              onClick: () => setAddStepContext({fromStepId: step.id, branch: 'yes'}),
            },
          });
        }

        if (!hasNoBranch) {
          nodes.push({
            id: `${step.id}-add-no`,
            type: 'addStep',
            position: {x: 0, y: 0},
            data: {
              label: 'No',
              onClick: () => setAddStepContext({fromStepId: step.id, branch: 'no'}),
            },
          });
        }
      } else {
        // For non-condition steps, add + node if no outgoing transitions
        if (!step.outgoingTransitions || step.outgoingTransitions.length === 0) {
          nodes.push({
            id: `${step.id}-add`,
            type: 'addStep',
            position: {x: 0, y: 0},
            data: {
              label: '',
              onClick: () => setAddStepContext({fromStepId: step.id}),
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
      if (step.outgoingTransitions && step.outgoingTransitions.length > 0) {
        step.outgoingTransitions.forEach(transition => {
          const condition = transition.condition as any;
          const isConditional = condition?.branch;
          const branch = condition?.branch;

          // Debug logging for transitions
          if (step.type === 'CONDITION') {
            const toStep = steps.find(s => s.id === transition.toStepId);
            console.log(`[EDGE] ${step.name} → ${toStep?.name || transition.toStepId}:`, {
              transitionId: transition.id,
              branch,
              condition: transition.condition,
            });
          }

          edges.push({
            id: transition.id,
            source: step.id,
            target: transition.toStepId,
            type: 'smoothstep',
            animated: step.type === 'DELAY' || step.type === 'WAIT_FOR_EVENT',
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
              strokeWidth: 2.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isConditional ? (branch === 'yes' ? '#16a34a' : '#dc2626') : '#94a3b8',
              width: 22,
              height: 22,
            },
          });
        });
      }

      // Add edges from steps to their "Add Step" nodes
      if (step.type === 'EXIT') return;

      if (step.type === 'CONDITION') {
        const hasYesBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'yes');
        const hasNoBranch = step.outgoingTransitions?.some(t => t.condition?.branch === 'no');

        if (!hasYesBranch) {
          edges.push({
            id: `${step.id}-add-yes-edge`,
            source: step.id,
            target: `${step.id}-add-yes`,
            type: 'smoothstep',
            animated: false,
            label: '✓ Yes',
            labelStyle: {fill: '#16a34a', fontWeight: 600, fontSize: 12},
            labelBgStyle: {fill: '#fff', fillOpacity: 0.95},
            labelBgPadding: [8, 4] as [number, number],
            labelBgBorderRadius: 4,
            style: {stroke: '#16a34a', strokeWidth: 2.5, strokeDasharray: '5,5'},
            markerEnd: {type: MarkerType.ArrowClosed, color: '#16a34a', width: 22, height: 22},
          });
        }

        if (!hasNoBranch) {
          edges.push({
            id: `${step.id}-add-no-edge`,
            source: step.id,
            target: `${step.id}-add-no`,
            type: 'smoothstep',
            animated: false,
            label: '✗ No',
            labelStyle: {fill: '#dc2626', fontWeight: 600, fontSize: 12},
            labelBgStyle: {fill: '#fff', fillOpacity: 0.95},
            labelBgPadding: [8, 4] as [number, number],
            labelBgBorderRadius: 4,
            style: {stroke: '#dc2626', strokeWidth: 2.5, strokeDasharray: '5,5'},
            markerEnd: {type: MarkerType.ArrowClosed, color: '#dc2626', width: 22, height: 22},
          });
        }
      } else {
        if (!step.outgoingTransitions || step.outgoingTransitions.length === 0) {
          edges.push({
            id: `${step.id}-add-edge`,
            source: step.id,
            target: `${step.id}-add`,
            type: 'smoothstep',
            animated: false,
            style: {stroke: '#94a3b8', strokeWidth: 2.5, strokeDasharray: '5,5'},
            markerEnd: {type: MarkerType.ArrowClosed, color: '#94a3b8', width: 22, height: 22},
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

  // Handle creating a new step from the + node
  const handleCreateStep = useCallback(
    async (stepType: string) => {
      if (!addStepContext?.fromStepId) return;

      try {
        // Validate that this branch doesn't already have a transition
        const fromStep = steps.find(s => s.id === addStepContext.fromStepId);
        if (!fromStep) {
          toast.error('Parent step not found');
          return;
        }

        // For CONDITION steps, check if the branch already exists
        if (fromStep.type === 'CONDITION' && addStepContext.branch) {
          const existingBranchTransition = fromStep.outgoingTransitions?.find(t => {
            const condition = t.condition as any;
            return condition?.branch === addStepContext.branch;
          });
          if (existingBranchTransition) {
            toast.error(`The ${addStepContext.branch} branch already has a connection`);
            return;
          }
        }

        // Create the new step (autoConnect: false because we manually create the transition with branch info)
        const newStep = await network.fetch<WorkflowStep>('POST', `/workflows/${workflowId}/steps`, {
          type: stepType,
          name: `New ${stepType.toLowerCase().replace('_', ' ')}`,
          position: {x: 0, y: 0}, // Will be auto-positioned by dagre layout
          config: {},
          autoConnect: false, // Disable auto-connect - we'll create the transition manually with proper branch condition
        });

        const newStepId = newStep.id;

        // Create the transition with proper condition
        const condition = addStepContext.branch ? {branch: addStepContext.branch} : null;
        const priority = addStepContext.branch === 'yes' ? 0 : addStepContext.branch === 'no' ? 1 : 0;

        console.log('━━━ Creating transition ━━━');
        console.log('  From step:', addStepContext.fromStepId, `(${fromStep.type}: ${fromStep.name})`);
        console.log('  To step:', newStepId, `(${stepType})`);
        console.log('  Condition:', JSON.stringify(condition));
        console.log('  Branch:', addStepContext.branch);
        console.log('  Priority:', priority);
        console.log('  Existing transitions:', fromStep.outgoingTransitions?.length || 0);
        fromStep.outgoingTransitions?.forEach((t, idx) => {
          const cond = t.condition as any;
          console.log(`    [${idx}] to: ${t.toStepId}, branch: ${cond?.branch}`);
        });

        await network.fetch('POST', `/workflows/${workflowId}/transitions`, {
          fromStepId: addStepContext.fromStepId,
          toStepId: newStepId,
          condition,
          priority,
        });

        toast.success('Step added successfully');
        setAddStepContext(null);
        onUpdate();

        // Trigger edit dialog for the new step after a short delay
        setTimeout(() => {
          const event = new CustomEvent('workflow-edit-step', {detail: {stepId: newStepId}});
          window.dispatchEvent(event);
        }, 100);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to add step');
      }
    },
    [addStepContext, workflowId, onUpdate],
  );

  const handleEditStep = (stepId: string) => {
    // This will be handled by the parent component
    const event = new CustomEvent('workflow-edit-step', {detail: {stepId}});
    window.dispatchEvent(event);
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('Are you sure you want to delete this step?')) {
      return;
    }

    try {
      await network.fetch('DELETE', `/workflows/${workflowId}/steps/${stepId}`);
      toast.success('Step deleted');
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete step');
    }
  };

  // Auto-layout on demand
  const handleAutoLayout = useCallback(() => {
    const {nodes: newNodes, edges: newEdges} = getLayoutedElements(nodes, edges);
    setNodes(newNodes);
    setEdges(newEdges);

    // Fit view after layout
    setTimeout(() => {
      reactFlowInstance?.fitView({padding: 0.3});
    }, 10);
  }, [nodes, edges, setNodes, setEdges, reactFlowInstance]);

  if (steps.length === 0) {
    return (
      <div className="bg-neutral-50 border-2 border-dashed border-neutral-300 rounded-lg p-12 text-center">
        <GitBranch className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
        <p className="text-neutral-600 font-medium">No workflow steps yet</p>
        <p className="text-sm text-neutral-500 mt-2">Add your first step to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-full h-[800px] bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-lg border border-neutral-200 shadow-inner relative">
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
          deleteKeyCode={null}
          proOptions={{hideAttribution: true}}
        >
          <Background color="#e5e7eb" gap={16} size={1} />
          <Controls
            showInteractive={false}
            className="bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-lg shadow-lg"
          />
          <MiniMap
            nodeColor={node => {
              const step = steps.find(s => s.id === node.id);
              return step ? STEP_TYPE_COLORS[step.type as keyof typeof STEP_TYPE_COLORS] : '#6b7280';
            }}
            className="bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-lg shadow-lg"
            maskColor="rgba(0, 0, 0, 0.05)"
          />
          <Panel position="top-left" className="bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-lg shadow-lg border border-neutral-200">
            <div className="flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-neutral-700" />
              <div className="text-sm">
                <span className="font-semibold text-neutral-900">{steps.length}</span>
                <span className="text-neutral-600"> step{steps.length !== 1 ? 's' : ''}</span>
                <span className="text-neutral-400 mx-2">·</span>
                <span className="font-semibold text-neutral-900">{rawEdges.length}</span>
                <span className="text-neutral-600"> connection{rawEdges.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </Panel>
          <Panel position="top-right" className="flex gap-2">
            <button
              onClick={handleAutoLayout}
              className="bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-white hover:text-neutral-900 transition-all"
            >
              Auto Layout
            </button>
          </Panel>
          {rawEdges.length === 0 && steps.length > 1 && (
            <Panel position="bottom-center" className="bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-lg shadow-lg">
              <div className="flex items-center gap-2 text-sm text-blue-900">
                <span>💡</span>
                <span>Click the + buttons to add and connect steps!</span>
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Step type picker dialog */}
      <Dialog open={!!addStepContext} onOpenChange={open => !open && setAddStepContext(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {STEP_TYPE_OPTIONS.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => handleCreateStep(option.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition-all group"
                  style={{
                    borderColor: 'transparent',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = option.color;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      backgroundColor: `${option.color}15`,
                    }}
                  >
                    <Icon className="h-6 w-6" style={{color: option.color}} />
                  </div>
                  <span className="text-sm font-medium text-neutral-900">{option.label}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStepContext(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
