import { getDbPool } from '../../utils/db'
import { resolveWorkflowUserId } from '../../utils/workflow-auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = await resolveWorkflowUserId(event, String(query.userId || ''))
  const withSteps = String(query.withSteps || 'true').toLowerCase() !== 'false'

  const pool = getDbPool()
  const workflowsRes = await pool.query(
    `
    SELECT id, user_id, title, topic, status, source_prompt, version, created_at, updated_at
    FROM public.workflows
    WHERE user_id = $1
    ORDER BY updated_at DESC
    `,
    [userId]
  )

  if (!withSteps || workflowsRes.rows.length === 0) {
    return {
      workflows: workflowsRes.rows
    }
  }

  const workflowIds = workflowsRes.rows.map((row) => row.id)
  const stepsRes = await pool.query(
    `
    SELECT id, workflow_id, step_order, instruction, is_enabled, created_at, updated_at
    FROM public.workflow_steps
    WHERE workflow_id = ANY($1::uuid[])
    ORDER BY workflow_id, step_order ASC
    `,
    [workflowIds]
  )

  const stepsByWorkflow = new Map<string, any[]>()

  for (const step of stepsRes.rows) {
    if (!stepsByWorkflow.has(step.workflow_id)) {
      stepsByWorkflow.set(step.workflow_id, [])
    }
    stepsByWorkflow.get(step.workflow_id)!.push(step)
  }

  return {
    workflows: workflowsRes.rows.map((workflow) => ({
      ...workflow,
      steps: stepsByWorkflow.get(workflow.id) || []
    }))
  }
})
