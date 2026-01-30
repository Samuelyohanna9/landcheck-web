type Props = {
  onChange: (coords: number[][] | null) => void;
};

export default function ManualCoords({ onChange }: Props) {
  const parse = (txt: string) => {
    try {
      const coords = txt
        .trim()
        .split("\n")
        .map(l => l.split(",").map(Number));
      onChange(coords);
    } catch {
      onChange(null);
    }
  };

  return (
    <div>
      <h4>Manual Coordinates</h4>
      <textarea
        rows={5}
        placeholder="lng,lat per line"
        onChange={e => parse(e.target.value)}
        style={{ width: "100%" }}
      />
    </div>
  );
}
