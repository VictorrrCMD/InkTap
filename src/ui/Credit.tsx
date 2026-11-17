export function Credit({ className = '' }: { className?: string }) {
  return (
    <p className={`credit ${className}`}>
      By{' '}
      <a href="https://victor-reyes.dev" target="_blank" rel="noopener">
        Victor Reyes
      </a>
    </p>
  )
}
