import { createFileRoute, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSOPStore } from '../hooks/useSOPStore'
import { StepSidebar } from '../components/StepSidebar'
import { StepDetail } from '../components/StepDetail'
import { fetchSOP, sopKeys } from '../api/client'

export const Route = createFileRoute('/sop/$id/procedure')({
  component: ProcedurePage,
})

function ProcedurePage() {
  const { id } = useParams({ from: '/sop/$id/procedure' })
  const { data: sop } = useQuery({
    queryKey: sopKeys.detail(id),
    queryFn: () => fetchSOP(id),
  })
  const { selectedStepId, setSelectedStep } = useSOPStore()

  const selectedStep = sop?.steps.find((s) => s.id === selectedStepId) ?? null

  useEffect(() => {
    if (sop && !selectedStepId && sop.steps.length > 0) {
      setSelectedStep(sop.steps[0].id)
    }
  }, [sop, selectedStepId, setSelectedStep])

  if (!sop) return null

  return (
    <div className="flex gap-6 items-start">
      <StepSidebar steps={sop.steps} />
      <StepDetail step={selectedStep} />
    </div>
  )
}
