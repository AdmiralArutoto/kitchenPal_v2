// Gradient hero from Figma frame dY6CJtDlp8tW2RQ0k1DTL4:1:6.
// Primary → gradient-end horizontal gradient; centered title + subtitle.
export default function Hero() {
  return (
    <section className="bg-gradient-to-r from-primary to-gradient-end">
      <div className="mx-auto flex max-w-[1024px] flex-col items-center gap-6 px-6 py-16 text-center">
        <h1 className="text-5xl font-medium leading-[48px] text-white">
          Discover Delicious Recipes
        </h1>
        <p className="text-xl leading-7 text-white/90">
          Explore thousands of recipes from around the world
        </p>
      </div>
    </section>
  );
}
