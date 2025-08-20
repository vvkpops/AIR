# Weather Monitor Dashboard

A comprehensive aviation weather monitoring dashboard that fetches and displays METAR and TAF data for multiple airports with customizable weather minima checking.

## Features

- **Real-time Weather Data**: Fetches METAR and TAF data from aviation weather services
- **Weather Minima Checking**: Set custom ceiling and visibility minimums per station
- **Visual Indicators**: Color-coded borders (red/green) based on weather conditions vs minima
- **Individual Controls**: Per-station minimize/expand and custom minima settings
- **Global Controls**: Set default minima for all stations, global minimize/expand
- **Data Persistence**: All settings saved to browser localStorage
- **Auto-refresh**: Weather data updates automatically every 5 minutes
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Getting Started

### Prerequisites
- Node.js 16+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd weather-monitor-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## Building for Production

```bash
npm run build
```

This builds the app for production to the `build` folder.

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

The app includes a `vercel.json` configuration file optimized for React apps.

### Other Platforms

The built app in the `build` folder can be deployed to any static hosting service like:
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Firebase Hosting

## Usage

1. **Add Weather Stations**: Enter ICAO codes (e.g., KJFK, EGLL, CYYZ) in the input field
2. **Set Weather Minima**: Adjust ceiling (feet) and visibility (statute miles) thresholds
3. **Monitor Conditions**: Tiles show green borders when above minima, red when below
4. **Customize View**: Use individual or global minimize controls to adjust information density

## Data Sources

- METAR data: Aviation Weather Center (aviationweather.gov)
- TAF data: Aviation Weather Center (aviationweather.gov)
- CORS proxy: corsproxy.io (for browser CORS handling)

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request
