import AppKit

// Native rendering of the circle mark used in the app header.
let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.075, green: 0.09, blue: 0.11, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 64, y: 64, width: 896, height: 896), xRadius: 205, yRadius: 205).fill()
NSColor(calibratedRed: 0.76, green: 0.94, blue: 0.53, alpha: 1).setStroke()
let ring = NSBezierPath(ovalIn: NSRect(x: 244, y: 244, width: 536, height: 536))
ring.lineWidth = 28
ring.stroke()
NSColor(calibratedRed: 0.76, green: 0.94, blue: 0.53, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 298, y: 298, width: 428, height: 428)).fill()
NSColor(calibratedRed: 0.14, green: 0.20, blue: 0.10, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 475, y: 475, width: 74, height: 74)).fill()
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
