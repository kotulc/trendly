import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'

function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom
}

export function ModalDialog({ className, labelledBy, saving, onClose, children }: {
  className: string
  labelledBy: string
  saving: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const startedOnBackdrop = useRef(false)

  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog ref={dialog} className={className} aria-labelledby={labelledBy}
    onPointerDown={event => { startedOnBackdrop.current = event.button === 0 && isBackdrop(event) }}
    onPointerCancel={() => { startedOnBackdrop.current = false }}
    onClick={event => {
      const clickedBackdrop = startedOnBackdrop.current && isBackdrop(event)
      startedOnBackdrop.current = false
      if (clickedBackdrop && !saving) onClose()
    }}
    onCancel={event => {
      event.preventDefault()
      if (!saving) onClose()
    }}>
    {children}
  </dialog>
}
