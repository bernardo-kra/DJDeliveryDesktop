function windowLayout(area) {
  const gap = 12;
  if (area.width < 1252 || area.height < 560) return null;
  const appWidth = Math.max(680, Math.floor((area.width - gap) * 0.54));
  return {
    dashboard: { x: area.x, y: area.y, width: appWidth, height: area.height },
    catalog: { x: area.x + appWidth + gap, y: area.y, width: area.width - appWidth - gap, height: area.height }
  };
}
module.exports = { windowLayout };
