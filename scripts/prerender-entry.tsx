import {renderToString} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom';
import App,{type Catalog} from '../src/App';
// Same public React components serve crawlers and visitors, as in the RevID build.
export function render(path:string,catalog:Catalog){return renderToString(<StaticRouter location={path}><App initialCatalog={catalog}/></StaticRouter>);}
