/*
 * (C) Copyright 2014, 2015 Markus Moenig <markusm@visualgraphics.tv>.
 *
 * This file is part of Visual Graphics.
 *
 * Visual Graphics is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Visual Graphics is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Visual Graphics.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

VG.UI.Workspace=function()
{
    /**
     * Creates an VG.UI.Workspace class.<br>
     * VG.UI.Workspace represents the visual workspace of every VG application or game. Before your application gets started, a VG.UI.Workspace object will be created
     * and passed as the first argument to vgMain(). 
     *
     * <br>VG.context is the context of your application and set as "this" for vgMain(). A reference to the application Workspace is set in 
     * VG.context.workspace.
     * 
     * @constructor
    */

    if ( !(this instanceof VG.UI.Workspace) ) return new VG.UI.Workspace();
    
    VG.UI.Widget.call( this );

    this.name="Workspace";
    this.focusWidget=0;
    
    /** Holds the content of the Workspace and has to be set within vgMain() to either a VG.UI.Widget derived object or one of the Layout objects. That object will fill the
     * available space of the Workspace and is the root object for all display widgets.
     *  @member {object} */    
    this.content=0; 

    this.needsRedraw=true;
    this.redrawList=new Array();
    
    /** The VG.Canvas for the Workspace, used for all drawing operations.
     *  @member {object} */    
    this.canvas=VG.Canvas();

    /** The Style object for the Workspace, used to implement the style (drawing) and skin (colors/fonts) of every Widget in the Workspace.
     *  @member {object} */   
    this.canvas.style=VG.context.style;

    this.shortcutManager=VG.Shortcut.Manager();

    this.mouseTrackerWidget=null;
    this.mousePos=VG.Core.Point();

    this.keysDown=[];

    this.menubars=[];
    this.toolbars=[];
    this.windows=[];
    this.widgets3d=[];
    this.statusbar=null;
    this.layout=VG.UI.SplitLayout();
    this.layout.margin.set( 0, 0, 0, 0 );

    this.loginButton=VG.UI.ToolButton( "Login" );
    this.signupButton=VG.UI.ToolButton( "Signup" );
    this.loginButton.clicked=this.showLoginDialog.bind( this );
    this.signupButton.clicked=this.showSignupDialog.bind( this );

    this.loginDialog=null;
    this.signupDialog=null;
    this.userName="";
    this.userNamePopup=VG.UI.ToolPanelPopupButton();
    this.userNamePopup.addItems( "Settings", "Logout" );

    this.dataCollectionForLoadSave=null;
    this.dataCollectionForUndoRedo=null;

    this.undo=null;

    this.platform=VG.getHostProperty( VG.HostProperty.Platform );
    this.operatingSystem=VG.getHostProperty( VG.HostProperty.OperatingSystem );

    this.textClipboard="";

    // --- Force a redraw every 1000ms
    this.autoRedrawInterval=1000;

    // --- Send an isLoggedIn request to the server to check if we are logged in or not.

    VG.sendBackendRequest( "/user/isLoggedIn", "", function( responseText ) {
        var response=JSON.parse( responseText );

        if ( response.status == "ok" && response.loggedIn == true )   
        {
            this.userName=response.username;

            this.userNamePopup.clear();
            this.userNamePopup.addItems( this.userName, "Settings", "Logout" );            

            if ( this.callbackForLoggedStateChanged )
                this.callbackForLoggedStateChanged( this.userName.length > 0 ? true : false, this.userName );        
            VG.update();
        }    
    }.bind(this), "GET" );

    // ---
};

VG.UI.Workspace.prototype=VG.UI.Widget();

Object.defineProperty( VG.UI.Workspace.prototype, "content", 
{
    get: function() {
        return this._content;
    },
    set: function( content ) {
        if ( this.layout ) {
            this._content=content;

            var insertAt=0;
            for( var i=0; i < this.layout.children.length; ++i )
            {
                var widget=this.layout.children[i];
                if ( widget instanceof VG.UI.DockWidget ) {
                    if ( widget.location === VG.UI.DockWidgetLocation.Left ) {
                        insertAt++;
                    } else break;
                } else break;
            }

            this.layout.insertChild( insertAt, content, 100 );

            //this.layout.addChild( content, 100 );
            this.recalcLayoutPercentages();
        }
    }    
});

VG.UI.Workspace.prototype.resize=function( width, height )
{
    /**Resizes the Workspace. Used by the host environment (Webbrowser, Desktop etc.) to resize the Workspace and trigger a redraw.
     * @param {number} width - The new width of the workspace
     * @param {number} height - The new height of the workspace
     */

    this.rect.setSize( width, height );
    VG.context.workspace.needsRedraw=true;   
    VG.context.workspace.canvas.hasBeenResized=true;   

    VG.Renderer().onResize( width, height );
};

VG.UI.Workspace.prototype.addDockWidget=function( dockWidget, location )
{
    /**Adds a Dock widget to the Workspace.
     * @param {VG.UI.DockWidget} widget - The DockWidget to add to the Workspace
     * @param {VG.UI.DockWidgetLocation} location - Currently limited to VG.UI.DockWidgetLocation.Left and VG.UI.DockWidgetLocation.Right.
     */

    if ( !location ) location=VG.UI.DockWidgetLocation.Left;

    var percent=dockWidget._oldPercent ? dockWidget._oldPercent : 20;

    var contentIndex=this.layout.children.indexOf( this._content );
    if ( contentIndex > -1 ) {
        if ( location === VG.UI.DockWidgetLocation.Left ) {
            this.layout.insertChild( contentIndex, dockWidget, percent );
        } else
        if ( location === VG.UI.DockWidgetLocation.Right ) {
            this.layout.insertChild( contentIndex+1, dockWidget, percent );
        }        
    } else this.layout.addChild( dockWidget, percent );

    dockWidget.location=location;
    this.recalcLayoutPercentages();
};

VG.UI.Workspace.prototype.detachDockWidget=function( dockWidget )
{
    /**Detaches a Dock widget from the Workspace.
     * @param {VG.UI.DockWidget} widget - The DockWidget to detach from the Workspace
     */

    dockWidget._oldPercent=dockWidget.rect.width / this.layout.rect.width * 100.0;

    this.layout.removeChild( dockWidget );
    this.windows.push( dockWidget );
    dockWidget.oldLocation=dockWidget.location;
    dockWidget.location=VG.UI.DockWidgetLocation.Floating;    
    this.recalcLayoutPercentages();    
};

VG.UI.Workspace.prototype.possiblyAttachDockWidget=function( dockWidget, useOldLocation )
{
    if ( dockWidget.oldLocation !== undefined && useOldLocation )
    {
        this.addDockWidget( dockWidget, dockWidget.oldLocation );
        var index=this.windows.indexOf( dockWidget );
        if ( index >= 0 )
            this.windows.splice( index, 1 );
    } else
    {
        // --- Check if the mouse position is near a border and if yes attach the dockwidget to that border
        if ( this.mousePos.x < this._content.rect.x + 100 ) {
            // --- Left of Content
            this.addDockWidget( dockWidget, VG.UI.DockWidgetLocation.Left );

            var index=this.windows.indexOf( dockWidget );
            if ( index >= 0 ) 
                this.windows.splice( index, 1 );
        } else
        if ( this.mousePos.x > this._content.rect.right() - 100 ) {
            // --- Right of Content
            this.addDockWidget( dockWidget, VG.UI.DockWidgetLocation.Right );

            var index=this.windows.indexOf( dockWidget );
            if ( index >= 0 )
                this.windows.splice( index, 1 );
        }        
    }     
};

VG.UI.Workspace.prototype.recalcLayoutPercentages=function()
{
    var percent=100.0;
    var contentOffset=-1;

    for( var i=0; i < this.layout.children.length; ++i ) {
        var widget=this.layout.children[i];
        if ( widget instanceof VG.UI.DockWidget ) {
            if ( widget.horizontalExpanding )
                percent-=this.layout.getChildPercentAt( i );
        } else contentOffset=i;
    }

    if ( contentOffset !== -1 )
        this.layout.setChildPercentAt( contentOffset, percent );
};

VG.UI.Workspace.prototype.addToolbar=function( toolbar )
{
    /**Adds a VG.UI.Toolbar to the top of the Workspace
     * @param {VG.UI.Toolbar} toolbar - The toolbar to add. Several Toolbars can be added to each Workspace
     */    
    this.toolbars.push( toolbar );
};

VG.UI.Workspace.prototype.addMenubar=function( menubar )
{
    /**Adds a VG.UI.Menubar to the top of the Workspace
     * @param {VG.UI.Menubar} menubar - The Menubar to add. Several Toolbars can be added to each Workspace
     */      
    this.menubars.push( menubar );
    this.paintMenubar=true;
};

VG.UI.Workspace.prototype.enableEmbeddedMode=function( callback )
{
    this.embeddedModeCallback=callback;
};

// --- paintWidget

VG.UI.Workspace.prototype.paintWidget=function()
{
    this.contentRect.set( this.rect );

    // --- This Workspace was run from inside the IDE, show the header

    if ( this.embeddedModeCallback )
    {
        this.contentRect.height=40;
        this.canvas.drawTextRect( "Click here to return to V-IDE", this.contentRect, VG.Core.Color( 255, 255, 255 ) );

        this.contentRect.y+=40;
        this.contentRect.height=this.rect.height - 40;
    }

    // --- Draw Menubar if any and if the menubar is painted by VG itself

    if ( this.menubars.length && this.paintMenubar ) {
        for ( var i=0; i < this.menubars.length; ++i)
        {    
            var menubar=this.menubars[i];

            menubar.rect.x=this.contentRect.x; menubar.rect.y=this.contentRect.y;
            menubar.rect.setSize( this.rect.width, VG.context.style.skin.MenubarHeight );

            menubar.paintWidget( this.canvas );

            this.contentRect.y+=menubar.rect.height;
            this.contentRect.height-=menubar.rect.height;
        }
    }

    // --- Draw Toolbar
    
    for ( var i=0; i < this.toolbars.length; ++i)
    {
        var toolbar=this.toolbars[i];

        if ( i === 0 )  {
            // --- VG logo on first toolbar
            toolbar.layout.margin.left=VG.context.style.skin.ToolbarLeftMargin;

            if ( this.platform === VG.HostProperty.PlatformWeb || this.userName.length > 0 ) 
            {
                this.canvas.pushFont( this.canvas.style.skin.LoginFont );
                if ( !this.userName.length ) {

                    var loginButtonSize=this.loginButton.calcSize( this.canvas );
                    var signupButtonSize=this.signupButton.calcSize( this.canvas );
                    var textSize=VG.Core.Size();
                    this.canvas.getTextSize( " ", textSize );

                    toolbar.layout.margin.right=loginButtonSize.width + textSize.width + signupButtonSize.width + 4;
                } else
                {
                    var textSize=VG.Core.Size();
                    this.canvas.getTextSize( this.userName, textSize );
                    toolbar.layout.margin.right=textSize.width + 4;                    
                }
                this.canvas.popFont();
            }
        }

        toolbar.rect.y=this.contentRect.y;
        toolbar.rect.setSize( this.rect.width, VG.context.style.skin.ToolbarHeight );
        toolbar.paintWidget( this.canvas );
        //this.contentRect.set( this.contentRect.add( 0, toolbar.rect.bottom(), 0, -toolbar.rect.height ) );
        this.contentRect.y+=toolbar.rect.height;
        this.contentRect.height-=toolbar.rect.height;

        if ( i === 0 )  {
            // --- VG logo on first toolbar

            if ( !this.vgFont ) {
                this.vgFont=VG.Font.Font( "Visual Graphics", VG.context.style.skin.ToolbarLogoSize );
                this.logoRect=VG.Core.Rect( toolbar.rect ); 
                this.logoRect.width=VG.context.style.skin.ToolbarLeftMargin;                
            }

            this.canvas.pushFont( this.vgFont );            
            this.canvas.drawTextRect( "a", this.logoRect, VG.context.style.skin.ToolbarLogoColor, 1, 1 ); 
            this.canvas.popFont();

            if ( this.platform === VG.HostProperty.PlatformWeb || this.userName.length > 0 ) 
            {
                this.canvas.pushFont( this.canvas.style.skin.LoginFont );

                if ( !this.userName.length ) {

                    // --- User is not logged in, show the Login / Logout buttons.

                    this.loginButton.visible=true;
                    this.signupButton.visible=true;
                    this.userNamePopup.visible=false;

                    // --- Draw Login Button

                    this.loginButton.rect.x=toolbar.rect.x + toolbar.rect.width - loginButtonSize.width - textSize.width - signupButtonSize.width - 2;     
                    this.loginButton.rect.y=toolbar.rect.y + (toolbar.rect.height - loginButtonSize.height) / 2;
                    this.loginButton.rect.width=loginButtonSize.width;    
                    this.loginButton.rect.height=loginButtonSize.height;

                    this.loginButton.paintWidget( this.canvas );   

                    // --- Draw " / " Text

                    var textRect=VG.Core.Rect( toolbar.rect );

                    textRect.x=toolbar.rect.x + toolbar.rect.width - textSize.width - signupButtonSize.width - 2;     
                    textRect.width=textSize.width;    
                    this.canvas.drawTextRect( " ", textRect, VG.context.style.skin.WidgetTextColor, 0, 1 ); 

                    // --- Draw Signin Button

                    this.signupButton.rect.x=toolbar.rect.x + toolbar.rect.width - signupButtonSize.width - 2;     
                    this.signupButton.rect.y=toolbar.rect.y + (toolbar.rect.height - signupButtonSize.height) / 2;
                    this.signupButton.rect.width=signupButtonSize.width;    
                    this.signupButton.rect.height=signupButtonSize.height;

                    this.signupButton.paintWidget( this.canvas );    
                } else
                {
                    // --- User is logged in, show username.

                    this.loginButton.visible=false;
                    this.signupButton.visible=false;
                    this.userNamePopup.visible=true;

                    var size=this.userNamePopup.calcSize();

                    this.userNamePopup.rect.set( toolbar.rect.right() - size.width - 10, toolbar.rect.y + (toolbar.rect.height - size.height) / 2, size.width, size.height );
                    this.userNamePopup.paintWidget( this.canvas );

                    /*
                    var textSize=VG.Core.Size();
                    this.canvas.getTextSize( this.userName, textSize );

                    var userNameRect=VG.Core.Rect( toolbar.rect );
                    userNameRect.width-=2;

                    this.canvas.drawTextRect( this.userName, userNameRect, VG.context.style.skin.WidgetTextColor, 2, 1 );
                    */
                }

                this.canvas.popFont();
            }
        }        
    }

    // --- Draw Statusbar
    
    if ( this.statusbar )
    {
        this.statusbar.rect.set( 0, this.rect.height - VG.context.style.skin.StatusbarHeight, this.rect.width, VG.context.style.skin.StatusbarHeight );
        this.statusbar.paintWidget( this.canvas );
        this.contentRect=this.contentRect.add( 0, 0, 0, -VG.context.style.skin.StatusbarHeight );
    }
    
    // --- Draw Layout

    this.canvas.draw2DShape( VG.Canvas.Shape2D.Rectangle, this.contentRect, VG.context.style.skin.WidgetBackgroundColor );

    if ( this.layout ) {
        this.layout.rect.set( this.contentRect );
        this.layout.layout( this.canvas );
    }

    // --- Draw Windows

    for ( var i=0; i < this.windows.length; ++i)
    {
        var window=this.windows[i];

        window.paintWidget( this.canvas );        
    }    

    // --- Check for delayed paint widgets (widgets with popups)

    if ( this.canvas.delayedPaintWidgets.length ) 
    {
        for( var i=0; i < this.canvas.delayedPaintWidgets.length; ++i ) {
            this.canvas.delayedPaintWidgets[i].paintWidget( this.canvas );
        }
        this.canvas.delayedPaintWidgets=[];
    }

    // --- Check if we have an active context Menu

    if ( this.contextMenu )
        this.contextMenu.paintWidget( this.canvas );

    // ---

    this.canvas.hasBeenResized=false;
};

VG.UI.Workspace.prototype.mouseMove=function( x, y )
{
    //print( "mouseMove( " + x + ", " + y + " );");

    var event=VG.Events.MouseMoveEvent();
    event.pos.set( x, y );

    // --- If a widget is tracking the mouse, this has priority

    if ( this.mouseTrackerWidget ) {

        this.mousePos.set( x, y );        
        this.mouseTrackerWidget.mouseMove( event );
        return;
    }

    // ---

    var windowUnderMouse=0;
    var widgetUnderMouse=0;
    var layoutUnderMouse=0;

    this.modalDialog=0;

    // --- Search for a window under the mouse

    for( var i=0; i < this.windows.length; ++i ) {       
        var window=this.windows[i];
        if ( window.visible && window.rect.contains( event.pos ) ) {

            windowUnderMouse=window;
            widgetUnderMouse=window;

            // --- Search the layout

            if ( windowUnderMouse.layout ) {
                var found=this.findLayoutItemAtMousePos( windowUnderMouse.layout, event.pos );
                if ( found && found.isWidget ) {
                    widgetUnderMouse=found;            
                }                   
            }

            // --- Search the buttonLayout (Dialogs Only)

            if ( widgetUnderMouse === window && windowUnderMouse.buttonLayout ) {
                var found=this.findLayoutItemAtMousePos( windowUnderMouse.buttonLayout, event.pos );
                if ( found && found.isWidget ) {
                    widgetUnderMouse=found;            
                }                   
            }

            // --- Search optional childWidgets

            if ( window.childWidgets ) {
                for ( var i=0; i < window.childWidgets.length; ++i) {
                    var child=window.childWidgets[i];
                    if ( child.rect.contains( event.pos ) )
                        widgetUnderMouse=child;
                }
            }
        }

        // --- Check if a dialog is currently being shown and if yes, set the modal flag for the workspace, i.e.
        // --- Dont accept any mouse or key input except from the modal dialog.

        if ( window.visible && (window instanceof VG.UI.Dialog ) ) {
            this.modalDialog=window;
        }
    }

    // --- Search for the widget or layout under the mouse

    // --- Draw Menubar if any and if the menubar is painted by VG itself

    if ( this.paintMenubar && !windowUnderMouse  ) {
        for ( var i=0; i < this.menubars.length; ++i)
        {    
            var menubar=this.menubars[i];
            if ( menubar.rect.contains( event.pos ) )
                widgetUnderMouse=menubar;
        }
    }

    // --- Search the toolbars

    if ( !windowUnderMouse && !widgetUnderMouse ) {

        if ( y < this.contentRect.y ) {
            for ( var i=0; i < this.toolbars.length; ++i)
            {
                var toolbar=this.toolbars[i];
                var found=this.findLayoutItemAtMousePos( toolbar.layout, event.pos );
                if ( found && found.isWidget ) {
                    widgetUnderMouse=found;            
                }           
            }

            if ( !widgetUnderMouse && this.loginButton.visible ) {
                if ( this.loginButton.rect.contains( event.pos ) ) {
                    widgetUnderMouse=this.loginButton;                
                }
            }

            if ( !widgetUnderMouse && this.signupButton.visible ) {
                if ( this.signupButton.rect.contains( event.pos ) ) {
                    widgetUnderMouse=this.signupButton;                
                }
            }     

            if ( !widgetUnderMouse && this.userNamePopup.visible ) {
                if ( this.userNamePopup.rect.contains( event.pos ) ) {
                    widgetUnderMouse=this.userNamePopup;                
                }
            }   
        } else 
        {
            // --- Search the main layout

            var found=this.findLayoutItemAtMousePos( this.layout, event.pos );
            if ( found ) {
                //console.log( "Found:" + found.name );

                if ( found.isWidget ) {
                    widgetUnderMouse=found;
                } else
                if ( found.isLayout ) {
                    layoutUnderMouse=found;
                }
            }
        }
    }

    // --- If we have a modal dialog and it is currently not under the mouse, ignore this event

    if ( this.modalDialog && windowUnderMouse !== this.modalDialog )
        return;

    // --- Evalutate the layout under the mouse
    
    if ( layoutUnderMouse !== this.layoutUnderMouse ) {
        
        if ( layoutUnderMouse ) {
            // --- New Layout has Hover

            if ( layoutUnderMouse.hoverIn )
                layoutUnderMouse.hoverIn();
        }
        
        if ( this.layoutUnderMouse ) {
            // --- This Layout has lost Hover State

            if ( this.layoutUnderMouse.hoverOut )
                this.layoutUnderMouse.hoverOut();            
        }
        
        this.layoutUnderMouse=layoutUnderMouse;

        if ( layoutUnderMouse && layoutUnderMouse.mouseMove )
            layoutUnderMouse.mouseMove( event );
    }    

    if ( this.layoutUnderMouse && this.layoutUnderMouse.mouseMove )
        this.layoutUnderMouse.mouseMove( event );

    // --- Evalutate the widget under the mouse
    
    if ( widgetUnderMouse !== this.widgetUnderMouse ) {
        
        if ( widgetUnderMouse ) 
        {
            // --- New Widget has Hover
            if ( !widgetUnderMouse.disabled && widgetUnderMouse.visualState === VG.UI.Widget.VisualState.Normal ) {
                widgetUnderMouse.visualState=VG.UI.Widget.VisualState.Hover;
                this.canvas.update();
            }

            // --- Send mouseEnter
            if ( !widgetUnderMouse.disabled && widgetUnderMouse.mouseEnter )
                widgetUnderMouse.mouseEnter( event );
        }
        
        if ( this.widgetUnderMouse ) 
        {
            // --- This Widget has lost Hover
            if ( this.focusWidget === this.widgetUnderMouse )
                this.widgetUnderMouse.visualState=VG.UI.Widget.VisualState.Focus;
            else
                this.widgetUnderMouse.visualState=VG.UI.Widget.VisualState.Normal;

            // --- Send mouseLeave
            if ( !this.widgetUnderMouse.disabled && this.widgetUnderMouse.mouseLeave )
                this.widgetUnderMouse.mouseLeave( event );

            this.canvas.update();
        }
        
        this.widgetUnderMouse=widgetUnderMouse;
    }

    this.windowUnderMouse=windowUnderMouse;

    if ( this.widgetUnderMouse && this.widgetUnderMouse.supportsAutoFocus === true && this.widgetUnderMouse !== this.focusWidget )
        this.setFocus( this.widgetUnderMouse );

    if ( this.focusWidget && this.focusWidget.mouseMove )
        this.focusWidget.mouseMove( event );
    else
    if ( this.widgetUnderMouse && this.widgetUnderMouse.mouseMove )
        this.widgetUnderMouse.mouseMove( event );     
    
    this.mousePos.set( x, y );
};

VG.UI.Workspace.prototype.mouseDown=function( button )
{
    if ( this.embeddedModeCallback && this.mousePos.y < 40 )
        this.embeddedModeCallback();

    // --- 

    this.mouseDownWidget=this.widgetUnderMouse;

    var event=VG.Events.MouseDownEvent( this );
    event.pos.set( this.mousePos );
    event.button=button;

    // --- If a widget is tracking the mouse, this has priority

    if ( this.mouseTrackerWidget && !this.contextMenu ) {
        this.mouseTrackerWidget.mouseDown( event );
        return;
    }

    // --- An active context menu has priority

    if ( this.contextMenu ) {

        if ( this.contextMenu.rect.contains( event.pos ) ) {
            this.contextMenu.mouseDown( event );
            this.canvas.update();    
            return;
        }
        else
        {
            // --- A click outside the menu closes it
            this.contextMenu.visible=false;
            this.contextMenu=null;
            this.mouseTrackerWidget=null;
        }
    }

    // ---

    this.setFocus( this.mouseDownWidget );

    if ( this.layoutUnderMouse && this.layoutUnderMouse.mouseDown )
        this.layoutUnderMouse.mouseDown( event );                

    if ( this.mouseDownWidget && this.mouseDownWidget.mouseDown && !this.mouseDownWidget.supportsFocus )
        this.mouseDownWidget.mouseDown( event );   
    else
    if ( this.focusWidget && this.focusWidget.mouseDown )
        this.focusWidget.mouseDown( event );   

    this.canvas.update();    
};

VG.UI.Workspace.prototype.mouseUp=function( button )
{
    //console.log( "mouseUp();", button );

    // --- Send mouseUp event

    var event=VG.Events.MouseUpEvent( this );
    event.pos.set( this.mousePos ); 
    event.button=button;

    // --- If a widget or layout tracks the mouse, this has priority

    if ( this.mouseTrackerWidget ) {
        this.mouseTrackerWidget.mouseUp( event );
        return;
    }   

    if ( this.layoutUnderMouse && this.layoutUnderMouse.mouseUp )
        this.layoutUnderMouse.mouseUp( event );    

    if ( this.mouseDownWidget && this.mouseDownWidget.mouseUp && !this.mouseDownWidget.supportsFocus )
        this.mouseDownWidget.mouseUp( event );  
    else
    if ( this.focusWidget && this.focusWidget.mouseUp )
        this.focusWidget.mouseUp( event );  

    // --- If the widget handles click events (buttons), send one.

    if ( this.mouseDownWidget && this.mouseDownWidget === this.widgetUnderMouse && this.mouseDownWidget.clicked && !this.mouseDownWidget.disabled ) 
        this.mouseDownWidget.clicked.call( VG.context );

    this.canvas.update();
};

VG.UI.Workspace.prototype.mouseDoubleClick=function()
{
    this.mouseDownWidget=this.widgetUnderMouse;

    var event=VG.Events.MouseDownEvent( this );
    event.pos.set( this.mousePos );

    if ( this.layoutUnderMouse && this.layoutUnderMouse.mouseDoubleClick )
        this.layoutUnderMouse.mouseDoubleClick( event );                

    if ( this.mouseDownWidget && this.mouseDownWidget.mouseDoubleClick && !this.mouseDownWidget.supportsFocus )
        this.mouseDownWidget.mouseDoubleClick( event );   
    else
    if ( this.focusWidget && this.focusWidget.mouseDoubleClick )
        this.focusWidget.mouseDoubleClick( event );   

    this.canvas.update();  
};

VG.UI.Workspace.prototype.mouseWheel=function( step )
{
    if ( this.widgetUnderMouse && !this.widgetUnderMouse.disabled && this.widgetUnderMouse.mouseWheel )
        return this.widgetUnderMouse.mouseWheel( step );

    return false;
};

VG.UI.Workspace.prototype.showContextMenu=function()
{
    this.mouseDownWidget=this.widgetUnderMouse;

    var event=VG.Events.MouseDownEvent( this );
    event.pos.set( this.mousePos );

    this.setFocus( this.mouseDownWidget );

    if ( this.layoutUnderMouse && this.layoutUnderMouse.showContextMenu )
        this.layoutUnderMouse.showContextMenu( event );   

    if ( this.mouseDownWidget && this.mouseDownWidget.parent.childWidgets && this.mouseDownWidget.parent.showContextMenu )
    {
        // --- Forwarding for embedded widgets (TableWidget)
        this.mouseDownWidget.parent.showContextMenu( event );   
    } else
    if ( this.mouseDownWidget && this.mouseDownWidget.showContextMenu && !this.mouseDownWidget.supportsFocus )
        this.mouseDownWidget.showContextMenu( event );   
    else
    if ( this.focusWidget && this.focusWidget.showContextMenu )
        this.focusWidget.showContextMenu( event );   

    this.canvas.update(); 
};

VG.UI.Workspace.prototype.keyDown=function( keyCode )
{
    // --- Test for Keyboard Shortcuts

    if ( this.keysDown.length && this.menubars.length )  {
        this.ignoreTextInput=this.shortcutManager.verifyMenubar( String.fromCharCode( keyCode ), this.keysDown, this.menubars[0] );    
    }

    if ( !this.ignoreTextInput && this.keysDown.length && this.focusWidget && this.focusWidget.contextMenu ) {
        this.ignoreTextInput=this.shortcutManager.verifyMenu( String.fromCharCode( keyCode ), this.keysDown, this.focusWidget.contextMenu );    
    }

    // ---

    this.keysDown.push( keyCode ); 

    if ( this.focusWidget && this.focusWidget.keyDown )
        this.focusWidget.keyDown( keyCode, this.keysDown );
}

VG.UI.Workspace.prototype.keyUp=function( keyCode )
{
    while ( this.keysDown.indexOf( keyCode ) >= 0 )
        this.keysDown.splice( this.keysDown.indexOf( keyCode ), 1 );

    if ( this.focusWidget && this.focusWidget.keyUp )
        this.focusWidget.keyUp( keyCode, this.keysDown );    
};

VG.UI.Workspace.prototype.textInput=function( text )
{
    if ( !this.ignoreTextInput && this.focusWidget && this.focusWidget.textInput )
        this.focusWidget.textInput( text );

    this.ignoreTextInput=false;
};

VG.UI.Workspace.prototype.setFocus=function( widget )
{
    /**Sets focus to a VG.UI.Widget derived widget. Has to support supportsFocus
     * @param {VG.UI.Widget} widget - The widget to set focus to
     */
    if ( widget && widget.supportsFocus && !widget.disabled && 
         widget.visualState !== VG.UI.Widget.VisualState.Focus ) 
    {
        widget.visualState=VG.UI.Widget.VisualState.Focus;
        
        if ( this.focusWidget ) {
            if ( this.focusWidget.focusOut ) this.focusWidget.focusOut();
                this.focusWidget.visualState=VG.UI.Widget.VisualState.Normal;
        }

        if ( widget.focusIn )
            widget.focusIn();
        
        this.focusWidget=widget;
        this.canvas.update();
    }
};

VG.UI.Workspace.prototype.widgetLostFocus=function( widget )
{
    if ( this.focusWidget === widget ) {

        if ( this.focusWidget.focusOut ) 
            this.focusWidget.focusOut();

        this.focusWidget.visualState=VG.UI.Widget.VisualState.Normal;
        this.focusWidget=0;            
        this.canvas.update();        
    } else console.log( "Unknown widget called widgetLostFocus()" );
}

VG.UI.Workspace.prototype.cycleFocus=function( widget )
{
    if ( this.focusWidget === widget ) {

        var parent=widget.parent;
        var index=parent.children.indexOf( widget );
        if ( index >= 0 ) {
            ++index;

            var newFocusWidget=0;

            while ( !newFocusWidget ) {
                if ( index >= parent.children.length ) {
                    index=0;
                }

                if ( parent.children[index].isWidget && parent.children[index].visible && !parent.children[index].disabled && parent.children[index].supportsFocus ) {
                    newFocusWidget=parent.children[index];
                }

                ++index;
            }

            this.setFocus( newFocusWidget );
        }

    } else console.log( "Unknown widget called cycleFocus()" );
};

VG.UI.Workspace.prototype.tick=function( needsRedraw )
{
    var redraw=false;    
    var current = Date.now();
    
    if ( ( ( current - this.lastRedrawTime ) > this.autoRedrawInterval ) || needsRedraw ) redraw=true;
    else
    {
        // --- Check if a redraw request time is true
        
        for( var i=0; i < this.redrawList.length; ++i ) {
            
            var time=this.redrawList[i];
            
            if ( time <= current ) {
                redraw=true;
                //console.log( "redraw timer triggered")

                // --- Create a new array only containing the none-expired redraw requests
        
                if ( this.redrawList.length ) 
                {
                    current = new Date().getTime();
            
                    var array=new Array();
                    for( var i=0; i < this.redrawList.length; ++i ) {
                
                        var time=this.redrawList[i];
                
                        if ( time > current )
                            array.push( time );
                    }
                    
                    // --- Replace the redrawList array
                    this.redrawList=array;
                }                
            }
        }
    }

    var rt=VG.Renderer().mainRT;
    
    if ( redraw ) { 

        rt.clear(true, true);
        rt.setViewport(this.rect);


        this.paintWidget();
        this.canvas.flush();

        this.lastRedrawTime=current;
    }
    
    return redraw;
};

VG.UI.Workspace.prototype.findLayoutItemAtMousePos=function( layout, pos )
{
    //console.log( "findLayoutItemAtMousePos: " + layout.name );
    if ( layout )
    {
        if ( layout.specialLayoutHitTest && layout.specialLayoutHitTest( pos ) )
        {
            return layout;
        } else
        {
            for ( var i=0; i < layout.children.length; ++i ) {
                var child=layout.children[i];

                // --- Check for StackedLayout Forwarding for childs
                if ( child instanceof VG.UI.StackedLayout ) 
                {
                    // --- Handle recursive VG.UI.StackedLayout situations
                    while ( child instanceof VG.UI.StackedLayout )
                        child=child.current;

                    if ( child === null ) continue;
                }

                // --- Check for StackedLayout Forwarding for child layouts of widgets
                if ( child.isWidget && child.layout instanceof VG.UI.StackedLayout && child.layout.rect.contains( pos ) ) 
                {
                    child=child.layout.current;
                    // --- Handle recursive VG.UI.StackedLayout situations
                    while ( child instanceof VG.UI.StackedLayout )
                        child=child.current;

                    if ( child === null ) continue;
                }                

                if ( child.isWidget ) {
                    if ( child.visible && child.rect.contains( pos ) ) {
                        if ( child.layout && child.layout.rect.contains( pos ) ) {
                            var found=this.findLayoutItemAtMousePos( child.layout, pos );
                            if ( found ) return found;
                            else return child.layout;
                        } else
                        if ( child.childWidgets ) {
                            for ( var i=0; i < child.childWidgets.length; ++i ) {
                                var widget=child.childWidgets[i];
                                if ( widget.rect.contains( pos ) ) {
                                    return widget;
                                }
                            }
                            return child;
                        } else return child;
                    }
                } else
                if ( child.isLayout ) {
                    var found=this.findLayoutItemAtMousePos( child, pos );
                    if ( found ) return found;
                }
            }
        }
    }    
    return 0;
};

VG.UI.Workspace.prototype.modelNewCallback=function()
{
    if ( this.dataCollectionForUndoRedo )
    {
        this.dataCollectionForUndoRedo.clearUndo();
        this.dataCollectionForUndoRedo.updateTopLevelBindings();
    }
};

VG.UI.Workspace.prototype.modelOpenCallback=function()
{
    if ( this.dataCollectionForLoadSave || this.callbackForOpen ) {
        var fileDialog=VG.RemoteFileDialog( this.modelFileType, this.modelOpen.bind( this ), "Select File", "Open" );
        this.showWindow( fileDialog );
    }
};

VG.UI.Workspace.prototype.modelOpen=function( callbackObject )
{
    var path=callbackObject.filePath;

    if ( path.length > 0 ) {
        VG.remoteOpenFile( path, function ( responseText ) {

            if ( this.dataCollectionForLoadSave ) 
            {
                var data=JSON.parse( responseText );
                data=VG.Utils.decompressFromBase64( data.data );

                // --- Clear Undo History
                this.dataCollectionForUndoRedo.clearUndo();

                // --- Load the data into the dataCollection
                var dc=this.dataCollectionForLoadSave;
                var json=JSON.parse( data );

                for (var key in json ) {
                    if ( dc.hasOwnProperty(key)) {
                        dc[key]=json[key];
                    }
                }
            } else
            if ( this.callbackForOpen ) 
            {
                var data=JSON.parse( responseText );
                this.callbackForOpen( data.data );
            }

            // --- Update the model            
            this.dataCollectionForUndoRedo.updateTopLevelBindings();        
        }.bind( this ) );
    }    
    VG.update();
};

VG.UI.Workspace.prototype.modelOpenLocalCallback=function()
{
    var fileDialog=VG.FileDialog( VG.UI.FileDialog.Project, function( name, data ) {

        if ( this.dataCollectionForLoadSave ) 
        {
            data=VG.Utils.decompressFromBase64( data );

            // --- Clear Undo History
            this.dataCollectionForUndoRedo.clearUndo();

            // --- Load the data into the dataCollection
            var dc=this.dataCollectionForLoadSave;
            var json=JSON.parse( data );

            for (var key in json ) {
                if ( dc.hasOwnProperty(key)) {
                    dc[key]=json[key];
                }
            }
        } else
        if ( this.callbackForOpen ) 
        {
            this.callbackForOpen( data );
        }
        VG.update();

    }.bind( this ) );
};

VG.UI.Workspace.prototype.modelSaveCallback=function()
{    
    if ( this.dataCollectionForLoadSave || this.callbackForSave ) {
        var fileDialog=VG.RemoteFileDialog( this.modelFileType, this.modelSave.bind( this ), "Select File to Save", "Save", true );
        this.showWindow( fileDialog );
    } 
};

VG.UI.Workspace.prototype.modelSave=function( callbackObject )
{
    var path=callbackObject.filePath;

    if ( path.length > 0 ) {
        var data;

        if ( this.dataCollectionForLoadSave ) data=VG.Utils.compressToBase64( JSON.stringify( this.dataCollectionForLoadSave ) );
        else if ( this.callbackForSave ) data=this.callbackForSave();

        if ( !callbackObject.download ) VG.remoteSaveFile( path, data );
        else
        {
            var params = {};
            params.filename = path;
            params.content = data;

            VG.downloadRequest("/api/download", params, "POST");
        }
        return data;
    }    
};

VG.UI.Workspace.prototype.modelCutCallback=function()
{   
    if ( this.focusWidget && this.focusWidget.clipboardCut ) 
        this.focusWidget.clipboardCut( "Text" );
};

VG.UI.Workspace.prototype.modelCopyCallback=function()
{ 
    VG.copyToClipboard( "Text", this.focusWidget.copySelection() );
};

VG.UI.Workspace.prototype.modelPasteCallback=function()
{ 
    if ( this.focusWidget && this.focusWidget.clipboardPaste ) 
        this.focusWidget.clipboardPaste( "Text" );
};

VG.UI.Workspace.prototype.modelDeleteCallback=function()
{   
    if ( this.focusWidget && this.focusWidget.clipboardDeleteSelection ) 
        this.focusWidget.clipboardDeleteSelection( "Text" );
};

VG.UI.Workspace.prototype.modelSelectAllCallback=function()
{   
    if ( this.focusWidget && this.focusWidget.selectAll ) 
        this.focusWidget.selectAll();
};

/* 
 * Callback used to update the disabled state of items with ActionRoles like Copy / Paste for the given menu.
 */

VG.UI.Workspace.prototype.modelMenuActionRoleValidationCallback=function( menu )
{
    for( var i=0; i < menu.items.length; ++i ) {
        var menuItem=menu.items[i];

        switch( menuItem.role ) {
            case VG.UI.ActionItemRole.Copy: 
                if ( this.focusWidget && this.focusWidget.clipboardCopyIsAvailable && this.focusWidget.clipboardCopyIsAvailable() !== null )
                    menuItem.disabled=false; else menuItem.disabled=true;
            break;

            case VG.UI.ActionItemRole.Cut: 
            case VG.UI.ActionItemRole.Delete: 
                if ( this.focusWidget && this.focusWidget.clipboardCopyIsAvailable ) {
                    var clipboardType=this.focusWidget.clipboardCopyIsAvailable();

                    // --- Check if we can paste into this widget, i.e. is not read only
                    if ( clipboardType !== null && this.focusWidget.clipboardPasteIsAvailableForType( clipboardType ) )
                        menuItem.disabled=false; else menuItem.disabled=true;
                } else menuItem.disabled=true;
            break;

            case VG.UI.ActionItemRole.Paste: 
                if ( VG.clipboardPasteDataForType( "Text" ) && this.focusWidget && this.focusWidget.clipboardPasteIsAvailableForType && this.focusWidget.clipboardPasteIsAvailableForType( "Text" ) )
                    menuItem.disabled=false; else menuItem.disabled=true;
            break;  

            case VG.UI.ActionItemRole.SelectAll: 
                if ( this.focusWidget && this.focusWidget.selectAll ) 
                    menuItem.disabled=false; else menuItem.disabled=true;
            break; 
        }
    }
};

VG.UI.Workspace.prototype.registerDataCollection=function( dataCollection, roles )
{
    /**Registers a VG.Data.Collection with the specified roles to the Workspace.
     * @param {VG.Data.Collection} dc - The data collection to register
     * @param {VG.UI.DataCollectionRole} roles - Currently supported roles are VG.UI.DataCollectionRole.LoadSaveRole, the DC is used for Application Load / Save operations, and
     * VG.UI.DataCollectionRole.UndoRedoRole, which adds automatic Undo / Redo functionality to the DC
     */    
    if ( roles & VG.UI.DataCollectionRole.LoadSaveRole )
    {
        this.dataCollectionForLoadSave=dataCollection;
    }

    if ( roles & VG.UI.DataCollectionRole.UndoRedoRole ) 
    {
        this.dataCollectionForUndoRedo=dataCollection;
        dataCollection.__vgUndo=VG.Data.Undo();
    }
};

VG.UI.Workspace.prototype.registerCallback=function( type, callback )
{
    /**Registers a callback for a specified callback type.
     * @param {VG.UI.CallbackType} type - The type of the callback
     * @param {function} func - The callback which gets invoked for the specified callback type
     */      
    switch ( type ) {

        case VG.UI.CallbackType.New: 
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.callbackForClear=callback;
        break;

        case VG.UI.CallbackType.UndoRedo: 
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.callbackForUndoRedo=callback;
        break;

        case VG.UI.CallbackType.Open: 
            this.callbackForOpen=callback;
        break;   

        case VG.UI.CallbackType.Save: 
            this.callbackForSave=callback;
        break;     

        case VG.UI.CallbackType.LoggedStateChanged: 
            this.callbackForLoggedStateChanged=callback;
            this.callbackForLoggedStateChanged( this.userName.length > 0 ? true : false, this.userName );
        break;              
    }
};

VG.UI.Workspace.prototype.addToolButtonRole=function( toolbar, role )
{
    /**Creates a VG.UI.ToolButton, adds a specified default role to it and inserts it to the specified toolbar.
     * @param {VG.UI.Toolbar} toolbar - The toolbar to add the new VG.UI.ToolButton to.
     * @param {VG.UI.ActionItemRole} role - The role to apply
     */        
    var button=VG.UI.ToolButton( "" );

    this.setupActionItemRole( button, role );
    button.role=role;

    toolbar.addItem( button );
    return button;
};

VG.UI.Workspace.prototype.addMenuItemRole=function( menu, role )
{
    /**Creates a VG.UI.MenuItem, adds a specified default role to it and inserts it to the specified VG.UI.Menu.
     * @param {VG.UI.Menu} menu - The menubar to add the new VG.UI.MenuItem to.
     * @param {VG.UI.ActionItemRole} role - The role to apply
     */      
    var menuItem=VG.UI.MenuItem( "" );

    this.setupActionItemRole( menuItem, role, menu );
    menuItem.role=role;

    menu.addMenuItem( menuItem );
    return menuItem;
};

VG.UI.Workspace.prototype.setupActionItemRole=function( object, role, parent )
{
    switch ( role ) {

        case VG.UI.ActionItemRole.New: 
            object.text="New"; 
            object.iconName="new.png"; 
            object.clicked=this.modelNewCallback.bind( this );
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.addNewWidget( object );
        break;

        case VG.UI.ActionItemRole.Open: 
            object.text="Open..."; 
            object.iconName="open.png"; 
            object.clicked=this.modelOpenCallback.bind( this );
        break;     

        case VG.UI.ActionItemRole.Open_Local: 
            object.text="Open Local..."; 
            //object.iconName="open.png"; 
            object.clicked=this.modelOpenLocalCallback.bind( this );
        break;           

        case VG.UI.ActionItemRole.Save: 
            object.text="Save..."; 
            object.iconName="save.png"; 
            object.clicked=this.modelSaveCallback.bind( this );
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.addSaveWidget( object );
        break;        

        case VG.UI.ActionItemRole.Undo: 
            object.text="Undo"; 
            object.iconName="undo.png";             
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.addUndoWidget( object );
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.Undo );            
        break;

        case VG.UI.ActionItemRole.Redo: 
            object.text="Redo"; 
            object.iconName="redo.png";                         
            if ( this.dataCollectionForUndoRedo ) this.dataCollectionForUndoRedo.__vgUndo.addRedoWidget( object );
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.Redo );
        break;

        case VG.UI.ActionItemRole.Cut: 
            object.text="Cut"; 
            if ( parent instanceof VG.UI.Menu ) parent.aboutToShow=this.modelMenuActionRoleValidationCallback.bind( this );
            object.clicked=this.modelCutCallback.bind( this );                                   
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.Cut );            
        break;

        case VG.UI.ActionItemRole.Copy: 
            object.text="Copy"; 
            object.clicked=this.modelCopyCallback.bind( this );
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.Copy );
        break;    

        case VG.UI.ActionItemRole.Paste: 
            object.text="Paste"; 
            object.clicked=this.modelPasteCallback.bind( this );
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.Paste );            
        break;  

        case VG.UI.ActionItemRole.Delete: 
            object.text="Delete"; 
            if ( parent instanceof VG.UI.Menu ) parent.aboutToShow=this.modelMenuActionRoleValidationCallback.bind( this, parent );  
            object.clicked=this.modelDeleteCallback.bind( this );
        break;   

        case VG.UI.ActionItemRole.SelectAll: 
            object.text="Select All"; 
            if ( parent instanceof VG.UI.Menu ) parent.aboutToShow=this.modelMenuActionRoleValidationCallback.bind( this, parent );  
            object.clicked=this.modelSelectAllCallback.bind( this );
            if ( parent instanceof VG.UI.Menu ) object.shortcut=this.shortcutManager.createDefault( VG.Shortcut.Defaults.SelectAll );            
        break;          

        default: 
            object.text="Unknown Role"; 
        break;
    }
};

VG.UI.Workspace.prototype.showWindow=function( window )
{
    /**Shows the VG.UI.Window derived object, like VG.UI.Dialog on the Workspace.
     * @param {VG.UI.Window} window - The window to display. Be sure to call the close() function of the Window / Dialog to close it after use.
     */     
    if ( this.windows.indexOf( window ) !== -1 ) return;

    window.calcSize( this.canvas );

    window.rect.x=(this.contentRect.width - window.rect.width) / 2;
    window.rect.y=250;//(this.contentRect.height - window.rect.height) / 2;

    window.visible=true;
    window.setFocus();

    window.close=function( window ) {
        if ( this.windows.indexOf( window ) !== -1 )  {
            this.windows.splice( this.windows.indexOf( window ), 1 );
            VG.update();
        }
    }.bind( this );
    
    this.windows.push( window );
};
