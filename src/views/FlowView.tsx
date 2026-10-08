import { useCallback, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import { useStore } from '../state/projectStore'
import { Avatar, Hint, ReqTag, STATUS_CLASS } from '../components/ui'
import { useT } from '../i18n/useT'
import { analyseDependencies, flattenTasks, isoToday } from '../lib/domainEngine'
import type { Task, TaskStatus, User } from '../domain/types'

/**
 * R4 — the dependency map.
 *
 * Reuses the same `Task.dependsOn` edge list that the scheduler walks, so the
 * picture the coordinator sees is the same data the deadline maths used. This
 * is the "dependency/waiting relationship" view: it answers "if this slips,
 * what slips with it, and who do I need to chase?"
 */

interface TaskNodeData extends Record<string, unknown> {
  task: Task
  owner: User | undefined
  stageName: string
  blocked: boolean
  overdue: boolean
  affects: number
  onThePath: boolean
  dimmed: boolean
}

const NODE_W = 232
const NODE_H = 78

function TaskNode({ data }: NodeProps) {
  const d = data as TaskNodeData
  const { t, tStatus } = useT()
  const cls = [
    'flow-node',
    d.blocked ? 'blocked' : '',
    d.task.status === 'done' ? 'done' : '',
    d.onThePath ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ opacity: d.dimmed ? 0.28 : 1 }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="fn-name">{d.task.name}</div>
      <div className="fn-meta">
        <span className="row" style={{ gap: 5 }}>
          {d.owner && <Avatar user={d.owner} className="sm" />}
          <span>{d.stageName}</span>
        </span>
        <span className="row" style={{ gap: 4 }}>
          <span className={`badge ${STATUS_CLASS[d.task.status]}`}>{tStatus(d.task.status)}</span>
        </span>
      </div>
      <div className="fn-meta" style={{ marginTop: 5 }}>
        <span className="mono">{d.task.deadline}</span>
        <span>
          {d.task.kind === 'collaborative'
            ? t('kind.shortCollaborative')
            : t('kind.shortIndividual')}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { task: TaskNode }

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 22, ranksep: 68, marginx: 20, marginy: 20 })
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
    }
  })
}

export function FlowView() {
  const project = useStore((s) => s.selectedProject())
  const users = useStore((s) => s.users)
  const focusedTaskId = useStore((s) => s.focusedTaskId)
  const setFocusedTask = useStore((s) => s.setFocusedTask)
  const toggleDependency = useStore((s) => s.toggleDependency)
  const setTaskStatus = useStore((s) => s.setTaskStatus)
  const setView = useStore((s) => s.setView)
  const { t, tStatus, tKind } = useT()

  const insights = useMemo(
    () => (project ? analyseDependencies(project.stages) : new Map()),
    [project],
  )

  const rows = useMemo(() => (project ? flattenTasks(project.stages) : []), [project])

  /**
   * Focus set: the focused task, everything it waits for (upstream) and
   * everything that would be pushed back (downstream).
   */
  const focusSet = useMemo(() => {
    if (!focusedTaskId || !project) return null
    const all = project.stages.flatMap((s) => s.tasks)
    const byId = new Map(all.map((t) => [t.id, t]))
    const up = new Set<string>()
    const stack = [focusedTaskId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const dep of byId.get(cur)?.dependsOn ?? []) {
        if (!up.has(dep)) {
          up.add(dep)
          stack.push(dep)
        }
      }
    }
    const down = new Set(insights.get(focusedTaskId)?.affects ?? [])
    return { up, down, self: focusedTaskId }
  }, [focusedTaskId, project, insights])

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = rows.map(({ task, stage }) => {
      const insight = insights.get(task.id)
      const onThePath = focusSet
        ? focusSet.self === task.id || focusSet.up.has(task.id) || focusSet.down.has(task.id)
        : false
      const data: TaskNodeData = {
        task,
        owner: users.find((u) => u.id === task.ownerId),
        stageName: stage.name,
        blocked: insight?.isBlocked ?? false,
        overdue: insight?.isOverdue ?? false,
        affects: insight?.affects.length ?? 0,
        onThePath,
        dimmed: Boolean(focusSet) && !onThePath,
      }
      return { id: task.id, type: 'task', position: { x: 0, y: 0 }, data }
    })

    const es: Edge[] = []
    for (const { task } of rows) {
      for (const dep of task.dependsOn) {
        const onThePath = focusSet
          ? (focusSet.up.has(dep) || focusSet.self === dep) &&
            (focusSet.down.has(task.id) || focusSet.self === task.id)
          : false
        const blockedEdge =
          (insights.get(task.id)?.blockedBy ?? []).includes(dep) && task.status !== 'done'
        es.push({
          id: `${dep}->${task.id}`,
          source: dep,
          target: task.id,
          animated: blockedEdge,
          style: {
            stroke: blockedEdge ? '#d93b3b' : onThePath ? '#4f46e5' : '#b9bfd2',
            strokeWidth: onThePath ? 2.4 : 1.4,
            opacity: focusSet && !onThePath ? 0.25 : 1,
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
        })
      }
    }

    return { nodes: layout(ns, es), edges: es }
  }, [rows, insights, users, focusSet])

  /**
   * The graph is derived and passed straight to ReactFlow — deliberately NOT
   * held in `useNodesState`.
   *
   * `useNodesState` snapshots its initial argument, so every later change to the
   * derived node data (notably the `dimmed` flag when a task is traced) was
   * silently ignored: the trace panel updated while the map itself never faded.
   * Nodes are therefore not user-draggable; the dagre layout is what matters for
   * this view, and the panel is where nodes are edited.
   */
  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      setFocusedTask(node.id === focusedTaskId ? null : node.id)
    },
    [focusedTaskId, setFocusedTask],
  )

  if (!project) return null

  const focused = focusedTaskId ? rows.find((r) => r.task.id === focusedTaskId)?.task : undefined
  const focusedInsight = focusedTaskId ? insights.get(focusedTaskId) : undefined
  const byId = new Map(rows.map((r) => [r.task.id, r.task]))
  const today = isoToday()
  const overdue = [...insights.values()].filter((i) => i.isOverdue).length
  const readyToStart = rows.filter(
    ({ task }) => task.status === 'todo' && !(insights.get(task.id)?.isBlocked ?? false),
  )

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 300 }}>
          <h1>{t('flow.title', { name: project.name })}</h1>
          <Hint>{t('flow.intro')}</Hint>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <ReqTag n={4} label={t('flow.reqLabel')} />
          <button className="btn sm" onClick={() => setView('board')}>
            {t('flow.backToBoard')}
          </button>
        </div>
      </div>

      {/*
        The four colour swatches were removed. Each was also explained in the
        "how to read this map" panel on the right, so the same legend appeared
        twice on one screen. What is left is the part that carries information the
        graph itself does not: how many tasks are overdue and how many can start.
      */}
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {overdue > 0 && (
          <span className="badge warn">{t('flow.overdueCount', { n: overdue })}</span>
        )}
        <span className="chip">{t('flow.readyCount', { n: readyToStart.length })}</span>
        <span className="chip">{t('flow.nodeCount', { n: nodes.length })}</span>
      </div>

      <div className="split">
        <div className="flow-wrap" data-guide="dependency-map">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            fitView
            minZoom={0.25}
            maxZoom={1.6}
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={18} size={1} color="#dfe3ee" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const d = n.data as TaskNodeData
                return d.task.status === 'done'
                  ? '#0f9d58'
                  : d.blocked
                    ? '#d93b3b'
                    : d.task.status === 'in_progress'
                      ? '#4f46e5'
                      : '#9aa2b8'
              }}
              style={{ background: 'var(--surface)' }}
            />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className="stack lg">
          {focused && focusedInsight ? (
            <div className="card pad">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="badge accent">{t('flow.tracedTask')}</span>
                <button
                  className="icon-btn"
                  onClick={() => setFocusedTask(null)}
                  title={t('common.close')}
                >
                  ×
                </button>
              </div>
              <div style={{ fontWeight: 660, marginBottom: 6 }}>{focused.name}</div>

              <div className="row small muted" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className={`badge ${STATUS_CLASS[focused.status]}`}>
                  {tStatus(focused.status)}
                </span>
                <span className="mono">{focused.startDate} → {focused.deadline}</span>
                <span className="badge neutral">
                  {focused.estimateDays}
                  {t('common.days')}
                </span>
                <span className={`badge ${focused.kind === 'collaborative' ? 'accent' : 'neutral'}`}>
                  {tKind(focused.kind)}
                </span>
                {focusedInsight.isOverdue && (
                  <span className="badge warn">{t('board.overdueBadge')}</span>
                )}
              </div>

              <label className="field">
                <span className="label">{t('flow.status')}</span>
                <select
                  value={focused.status}
                  onChange={(e) =>
                    setTaskStatus(project.id, focused.id, e.target.value as TaskStatus)
                  }
                >
                  {(Object.keys(STATUS_CLASS) as TaskStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {tStatus(s)}
                    </option>
                  ))}
                </select>
              </label>

              {focusedInsight.blockedBy.length > 0 ? (
                <div className="note danger">
                  <span className="note-icon">⛔</span>
                  <span>
                    <strong>{t('flow.cannotStartBody')}</strong> {t('flow.waitingForBody')}{' '}
                    {focusedInsight.blockedBy
                      .map((id: string) => byId.get(id)?.name ?? t('common.none'))
                      .join(', ')}
                    .
                  </span>
                </div>
              ) : (
                <div className="note ok">
                  <span className="note-icon">✓</span>
                  <span>
                    {t('flow.nothingBlocks')}
                    {focused.deadline && focused.deadline < today ? t('flow.butDatePassed') : '。'}
                  </span>
                </div>
              )}

              {focusedInsight.affects.length > 0 && (
                <div className="note warn">
                  <span className="note-icon">⇢</span>
                  <span>
                    <strong>{t('flow.ifSlips', { n: focusedInsight.affects.length })}</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {focusedInsight.affects.slice(0, 6).map((id: string) => (
                        <li key={id}>{byId.get(id)?.name ?? id}</li>
                      ))}
                    </ul>
                  </span>
                </div>
              )}

              <div className="small" style={{ fontWeight: 650, marginTop: 4 }}>
                {t('flow.waitsForLabel')}
              </div>
              <div className="dep-list">
                {rows
                  .filter((r) => r.task.id !== focused.id)
                  .map(({ task: other, stage }) => (
                    <label className="dep-option" key={other.id}>
                      <input
                        type="checkbox"
                        checked={focused.dependsOn.includes(other.id)}
                        onChange={() => toggleDependency(project.id, focused.id, other.id)}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {other.name}
                        <span className="muted small"> · {stage.name}</span>
                      </span>
                    </label>
                  ))}
              </div>
              <Hint style={{ marginTop: 6 }}>{t('flow.depNote')}</Hint>
            </div>
          ) : (
            <div className="card pad" data-verbose="">
              <h3 className="section-title">{t('flow.howToRead')}</h3>
              <div className="stack sm small">
                <div>{t('flow.readClick')}</div>
                <div>{t('flow.readRed')}</div>
                <div>{t('flow.readCoordinator')}</div>
              </div>
            </div>
          )}

          <div className="card pad">
            <h3 className="section-title">{t('flow.readyHeading')}</h3>
            <div className="stack sm">
              {readyToStart.length === 0 && (
                <div className="small muted">{t('flow.noReady')}</div>
              )}
              {readyToStart.map(({ task, stage }) => (
                <div className="row small" key={task.id} style={{ gap: 8, cursor: 'pointer' }}
                  onClick={() => setFocusedTask(task.id)}>
                  <Avatar user={users.find((u) => u.id === task.ownerId)} className="sm" />
                  <span style={{ flex: 1, minWidth: 0 }}>{task.name}</span>
                  <span className="muted nowrap">{stage.name}</span>
                </div>
              ))}
            </div>
            <Hint style={{ marginTop: 8 }}>{t('flow.readyNote')}</Hint>
          </div>
        </div>
      </div>
    </>
  )
}
