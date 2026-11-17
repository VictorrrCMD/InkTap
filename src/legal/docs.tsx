import type { ReactNode } from 'react'
import { legalHref } from './owner'

const To = ({ slug, children }: { slug: Parameters<typeof legalHref>[0]; children: ReactNode }) => <a href={legalHref(slug)}>{children}</a>

function Terms() {
  return (
    <>
      <p className="legal__lead">
        Con InkTap rellenas formularios PDF y les pones tu firma desde el navegador: tus documentos, tus firmas y lo que escribes se quedan en tu equipo. Al usar InkTap aceptas estos términos y el <To slug="privacidad">Aviso de privacidad</To>.
      </p>

      <h2>InkTap es una herramienta</h2>
      <p>
        InkTap solo pone a tu alcance funciones para llenar y firmar documentos en tu propio equipo. No interviene en tus documentos, no conoce su contenido, no verifica
        identidades y no participa en los acuerdos que firmes.
      </p>
      <p>
        <strong>Quien usa InkTap es el único responsable</strong> de los documentos que llena y firma, de las firmas que usa, de tener derecho a usarlas y de cumplir la
        ley que aplique a cada documento.
      </p>

      <h2>Qué es la firma que pones con InkTap</h2>
      <p>
        La firma que colocas es una imagen o un trazo de tu firma autógrafa, como si firmaras una hoja y la escanearas. No es una firma electrónica avanzada ni una
        e.firma: no lleva certificado digital, sello de tiempo ni verificación de identidad.
      </p>
      <p>
        Su validez depende de lo que acuerden las partes y de la ley que aplique a cada documento. Si un trámite exige firma electrónica avanzada u otro medio específico,
        usa el que ese trámite indique.
      </p>

      <h2>Tus responsabilidades</h2>
      <ul>
        <li>Firmar solo con tu propia firma, o con la de otra persona únicamente si te autorizó de forma expresa y la ley lo permite.</li>
        <li>Tener derecho a usar y modificar los documentos que abres.</li>
        <li>Revisar el documento antes de firmarlo y conservar tu copia: InkTap no guarda los documentos que descargas.</li>
        <li>
          Seguir las reglas de <To slug="uso-responsable">Uso responsable de firmas</To>.
        </li>
      </ul>

      <h2>Usos prohibidos</h2>
      <ul>
        <li>Falsificar firmas o firmar en nombre de otra persona sin su autorización.</li>
        <li>Usar firmas obtenidas sin consentimiento, por ejemplo fotos de firmas tomadas de otros documentos o de identificaciones.</li>
        <li>Alterar documentos para engañar a alguien o hacerse pasar por otra persona.</li>
        <li>Usar InkTap para cualquier fin ilícito.</li>
        <li>Intentar vulnerar el servicio, saturarlo o interferir con su funcionamiento.</li>
      </ul>
      <p>Quien haga un uso indebido responde por los daños que cause, conforme a la ley.</p>

      <h2>Lo que InkTap no hace</h2>
      <ul>
        <li>No verifica la identidad de quien firma.</li>
        <li>No guarda copias de tus documentos ni de tus firmas en sus servidores, y no lleva registro de quién firmó qué.</li>
        <li>Por lo mismo, no puede recuperar documentos, emitir constancias ni servir como prueba de quién firmó un documento.</li>
      </ul>

      <h2>Disponibilidad</h2>
      <p>
        InkTap se ofrece tal como está. Puede cambiar, tener interrupciones o dejar de estar disponible. Los códigos para firmar desde el celular vencen a los 10 minutos y
        sirven para una sola firma.
      </p>

      <h2>Limitación de responsabilidad</h2>
      <p>
        InkTap se ofrece sin garantías. En la medida en que la ley lo permita, quienes desarrollan y ofrecen InkTap no responden por el contenido de los documentos, por
        su validez legal, por las decisiones que se tomen con base en ellos ni por el uso indebido de la herramienta.
      </p>

      <h2>Propiedad intelectual</h2>
      <p>
        Tus documentos y tus firmas son tuyos; usar InkTap no le da a nadie derechos sobre ellos. El nombre y los logotipos de InkTap pertenecen a sus titulares.
      </p>
      <p>InkTap usa software de terceros, cada uno con su propia licencia:</p>
      <ul>
        <li>pdf.js (Apache 2.0), para mostrar los PDF.</li>
        <li>pdf-lib, en la versión de Cantoo (MIT), para escribir y aplanar los PDF.</li>
        <li>Potrace, en el paquete esm-potrace-wasm (GPL 2.0), para convertir fotos de firmas en trazos.</li>
        <li>React, perfect-freehand, uqr, Phosphor Icons y el kit de stageshow (MIT).</li>
        <li>Las tipografías Schibsted Grotesk, Great Vibes y Caveat (SIL Open Font License 1.1) y Homemade Apple (Apache 2.0).</li>
      </ul>

      <h2>Cambios a estos términos</h2>
      <p>Si estos términos cambian, publicaremos la nueva versión en esta página con su fecha de actualización.</p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se interpretan conforme a las leyes de los Estados Unidos Mexicanos.</p>
    </>
  )
}

function Privacy() {
  return (
    <>
      <p className="legal__lead">
        <strong>Todo se queda en tu equipo.</strong> Tus PDF, tus firmas y todo lo que escribes se procesan en tu navegador y no se suben a ningún servidor. InkTap no
        recopila tu información: no tiene cuentas de usuario, analítica, publicidad ni rastreo. La única excepción es firmar desde el celular: esa firma viaja cifrada de
        un equipo al otro, el servidor no puede leerla y se borra en cuanto llega.
      </p>

      <h2>InkTap no recopila tus datos</h2>
      <p>
        InkTap es una herramienta que funciona en tu navegador. No tiene cuentas de usuario, no recibe tus documentos ni tus firmas y no guarda información tuya que
        pueda leer. No existe una base de datos con información de quienes la usan.
      </p>

      <h2>Lo que se queda en tu equipo</h2>
      <ul>
        <li>Los PDF que abres y lo que escribes en ellos. Se procesan en la memoria de tu navegador y desaparecen al cerrar el documento o la pestaña.</li>
        <li>Las firmas que dibujas, escribes o subes en foto. Quitar el fondo de una foto y convertirla en trazos también ocurre en tu equipo.</li>
        <li>Las fotos que tomas con la cámara. La cámara solo se enciende cuando eliges Tomar foto, y la imagen no sale de tu equipo.</li>
        <li>
          Las firmas que pides recordar y tu preferencia de modo claro u oscuro. Se guardan en el almacenamiento local de ese navegador, no en un servidor (ver{' '}
          <To slug="cookies">Cookies y almacenamiento</To>).
        </li>
      </ul>

      <h2>Firmar desde el celular</h2>
      <p>Para que una firma hecha en tu celular llegue a tu computadora tiene que pasar por un servidor. Así se protege:</p>
      <ul>
        <li>La firma (o la foto de tu firma) y el nombre del documento se cifran en el dispositivo con AES-GCM de 256 bits antes de enviarse.</li>
        <li>La clave para descifrarla va en el enlace del código QR, en la parte que los navegadores no envían al servidor. El servidor solo guarda contenido cifrado que no puede leer.</li>
        <li>
          Se borra en cuanto tu computadora lo recibe o si cierras la ventana de firma. Si nadie lo recoge, el código vence a los 10 minutos y una limpieza automática que
          corre cada hora elimina cualquier sesión de más de 20 minutos.
        </li>
        <li>Cada código sirve para una sola firma.</li>
      </ul>

      <h2>Datos técnicos de las visitas</h2>
      <p>
        El sitio se entrega a través de un proveedor de alojamiento, Netlify, Inc., con servidores en Estados Unidos y otros países. Como ocurre con cualquier página
        web, ese proveedor procesa datos técnicos de la conexión, como tu dirección IP, el tipo de navegador y la hora, para entregar el sitio y limitar abusos (por
        ejemplo, un máximo de solicitudes por minuto). InkTap no usa esos datos para identificarte.
      </p>

      <h2>Para qué se usa</h2>
      <p>
        Solo para que una firma hecha en tu celular llegue a tu computadora y para que el sitio funcione y esté protegido. No se usa para publicidad, mercadotecnia ni
        perfiles, y no se vende ni se comparte con nadie más.
      </p>

      <h2>Con quién se comparte</h2>
      <p>
        Con nadie, salvo el proveedor de alojamiento, que procesa los datos técnicos y el contenido cifrado de las sesiones únicamente para prestar el servicio. Por eso
        esos datos pueden procesarse fuera de México.
      </p>

      <h2>Datos sensibles</h2>
      <p>
        InkTap no te pide datos personales sensibles. Tus documentos pueden contenerlos, pero no salen de tu equipo. Tu firma es un dato personal que te identifica: por
        eso se procesa en tu equipo y, cuando viaja desde el celular, va cifrada.
      </p>

      <h2>Tú controlas tu información</h2>
      <p>
        Como InkTap no conserva datos tuyos que pueda leer, no hay información personal que consultar, corregir o borrar en sus servidores. Lo que guarda tu navegador lo
        controlas tú: las firmas recordadas se eliminan desde la pestaña Guardadas, y todo lo demás al borrar los datos de este sitio en tu navegador.
      </p>

      <h2>Cambios a este aviso</h2>
      <p>Si este aviso cambia, publicaremos la nueva versión en esta página con su fecha de actualización.</p>
    </>
  )
}

function Cookies() {
  return (
    <>
      <p className="legal__lead">
        <strong>InkTap no usa cookies</strong>, ni propias ni de terceros. No hay analítica, publicidad ni rastreo de ningún tipo.
      </p>

      <h2>Lo que sí guarda tu navegador</h2>
      <p>InkTap usa el almacenamiento local de tu navegador para dos cosas, solo en ese equipo y sin enviarlas a ningún servidor:</p>
      <div className="legal__table-wrap">
        <table className="legal__table">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Para qué</th>
              <th scope="col">Cuánto dura</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>inktap:theme</code>
              </td>
              <td>Recordar si elegiste modo claro u oscuro.</td>
              <td>Hasta que lo cambies o borres los datos del sitio.</td>
            </tr>
            <tr>
              <td>
                <code>inktap:signatures</code>
              </td>
              <td>Las firmas que marcaste con Recordar en este navegador (hasta 4).</td>
              <td>Hasta que las elimines o borres los datos del sitio.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Cómo borrarlo</h2>
      <ul>
        <li>Una firma guardada: abre Firmar, ve a Guardadas y usa el botón de eliminar de esa firma.</li>
        <li>Todo: borra los datos de este sitio desde la configuración de privacidad de tu navegador.</li>
      </ul>

      <h2>Si esto cambia</h2>
      <p>Si algún día InkTap necesitara usar cookies, lo diremos en esta página antes de hacerlo y, cuando la ley lo pida, te pediremos permiso.</p>
    </>
  )
}

function Responsible() {
  return (
    <>
      <p className="legal__lead">
        Una firma compromete a quien la pone. InkTap es una herramienta que hace fácil firmar, incluso desde una foto; la responsabilidad de cada firma es de quien la usa.
      </p>

      <h2>Reglas básicas</h2>
      <ul>
        <li>Firma solo con tu propia firma.</li>
        <li>Firma por otra persona solo si te autorizó de forma expresa y la ley lo permite, por ejemplo con un poder.</li>
        <li>Sube solo fotos de tu propia firma. No uses firmas tomadas de otros documentos, de identificaciones o de fotos de otras personas.</li>
        <li>No modifiques documentos para engañar a nadie.</li>
      </ul>

      <h2>Falsificar una firma es delito</h2>
      <p>
        Falsificar firmas o documentos, o usar documentos falsos, puede constituir delito conforme a las leyes penales de México y de otros países, además de obligar a
        reparar los daños causados. Usar InkTap para eso está prohibido por los <To slug="terminos">Términos y condiciones</To>.
      </p>

      <h2>Lo que hace InkTap para evitar abusos</h2>
      <ul>
        <li>Antes de usar una firma desde una foto, pide confirmar que es tuya o que su titular te autorizó a usarla.</li>
        <li>No guarda documentos ni firmas en servidores, así que no hay un archivo de firmas que alguien pueda robar.</li>
        <li>Los códigos para firmar desde el celular vencen a los 10 minutos y sirven para una sola firma.</li>
      </ul>

      <h2>Lo que InkTap no puede hacer</h2>
      <p>
        InkTap no verifica identidades ni guarda registro de quién firmó qué. Si necesitas certeza sobre quién firmó un documento, usa una firma electrónica avanzada
        (como la e.firma del SAT) o un servicio con verificación de identidad y constancias de conservación de documentos.
      </p>

      <h2>Si alguien usó tu firma sin permiso</h2>
      <p>
        Acude a las autoridades (por ejemplo, la fiscalía de tu estado) con el documento en cuestión. Como InkTap no guarda copias de documentos ni registro de quién
        firmó qué, no puede rastrearlos ni entregarlos.
      </p>

      <h2>Para cuidar tu firma</h2>
      <ul>
        <li>Lee completo lo que vas a firmar.</li>
        <li>Guarda una copia de cada documento que firmes.</li>
        <li>Desconfía de quien te pida una foto de tu firma sin un motivo claro.</li>
      </ul>
    </>
  )
}

export const DOCS = {
  terminos: Terms,
  privacidad: Privacy,
  cookies: Cookies,
  'uso-responsable': Responsible,
} as const
