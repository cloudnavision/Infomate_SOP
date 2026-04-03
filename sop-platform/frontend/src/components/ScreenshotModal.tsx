import { useEffect } from 'react'

interface Props {
  src: string
  alt?: string
  onClose: () => void
}

export function ScreenshotModal({ src, alt = 'Screenshot', onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-white text-xl font-bold hover:text-gray-300"
        >
          ✕
        </button>
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
        />
      </div>
    </div>
  )
}
