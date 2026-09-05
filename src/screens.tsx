export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section class="screen">
      <h1 class="eyebrow">{title}</h1>
      <p class="note">{note}</p>
    </section>
  )
}
